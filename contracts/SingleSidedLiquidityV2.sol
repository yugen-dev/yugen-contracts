// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IDystRouter01.sol";
import "interfaces/IDystFactory.sol";
import "interfaces/IDystPair.sol";
import "interfaces/IWETH.sol";
import "./libraries/TransferHelper.sol";

contract SingleSidedLiquidityV2 is ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IDystFactory public immutable factory;
    IDystRouter01 public immutable router;
    IERC20 public immutable weth;

    uint256 private slippageAdjustedMinLP;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    constructor(IDystRouter01 _router, IERC20 _weth) {
        require(address(_router) != address(0), "No zero address");
        require(address(IDystFactory(_router.factory())) != address(0), "Invalid Factory address");
        require(address(_weth) != address(0), "No zero address");
        router = _router;
        factory = IDystFactory(_router.factory());
        weth = _weth;
    }

    /**
     * @dev Fallback function for receiving native token after sending wrapped token
     */
    receive() external payable {
        assert(msg.sender == address(weth)); // only accept native token via fallback from the wrapped contract
    }

    /**
    @notice This function is used to invest in given Dystopia/Velodrome/Solidly LP pair through any compatible ERC20 token
    @param _userAddress User Address who actually deposited there token , recipient of any dust
    @param _fromToken The ERC20 token used for investment (address(0x0000000000000000000000000000000000000000) if matic)
    @param _fromTokenAmount The amount of fromToken to invest
    @param _pairAddress The LP token pair address
    @param _toToken Either of the ERC20 token of the pair. 
    This should ideally be a token which we want the swap to happen if we want an LP of tokens A,B and the input token is C.
    So id _toToken is B, input token C will be swapped to B first and then used to invest in LP of A and B
    @param _slippageAdjustedMinLP Minimum acceptable Slippage LP token amount
    @param _intermediatePairType if the intermediate pair (explained above) is stable or volatile
    @return lpBought Amount of LP bought
     */
    function poolLiquidity(
        address _userAddress,
        address _fromToken,
        uint256 _fromTokenAmount,
        address _pairAddress,
        address _toToken,
        uint256 _slippageAdjustedMinLP,
        bool _intermediatePairType
    ) public payable nonReentrant returns (uint256 lpBought) {
        (address token0, address token1, ) = _getPairTokens(_pairAddress);
        require(
            _toToken == token0 || _toToken == token1,
            "_toToken not an underlying token of _pairAddress"
        );

        uint256 toInvest = _pullTokens(_fromToken, _fromTokenAmount);
        if (_fromToken == address(0)) {
            _fromToken = address(weth);
        }

        if (_fromToken != token0 && _fromToken != token1) {
            toInvest = _swapTokensInternal(
                _fromToken,
                _toToken,
                _intermediatePairType,
                _fromTokenAmount,
                1
            );

            //Returning Residue in from token amount, if any. If it was eth, then we send eth
            uint256 fromTokenResidue = IERC20(_fromToken).balanceOf(address(this));
            if (fromTokenResidue > 0) {
                if (_fromToken == address(0)) {
                    IWETH(address(weth)).withdraw(fromTokenResidue);
                    TransferHelper.safeTransferETH(msg.sender, fromTokenResidue);
                } else {
                    TransferHelper.safeTransfer(_fromToken, msg.sender, fromTokenResidue);
                }
            }
            _fromToken = _toToken;
        }

        lpBought = _poolLiquidity(_fromToken, _pairAddress, toInvest);
        TransferHelper.safeTransfer(_pairAddress, msg.sender, lpBought);
    }

    function _poolLiquidity(
        address _fromToken,
        address _pairAddress,
        uint256 _amount
    ) internal returns (uint256) {
        (address _token0, address _token1, bool _stable) = _getPairTokens(_pairAddress);

        // divide intermediate into appropriate amount to add liquidity
        (uint256 token0Bought, uint256 token1Bought) = _breakAndSwapTokens(
            _fromToken,
            _token0,
            _token1,
            _stable,
            _amount
        );

        (uint256 lpAmount, uint256 amountA, uint256 amountB) = _poolDeposit(
            _token0,
            _token1,
            _stable,
            token0Bought,
            token1Bought
        );

        return lpAmount;
    }

    function _poolDeposit(
        address _token0,
        address _token1,
        bool _stable,
        uint256 _token0Bought,
        uint256 _token1Bought
    )
        internal
        returns (
            uint256 liquidity,
            uint256 amountA,
            uint256 amountB
        )
    {
        TransferHelper.safeApprove(address(_token0), address(router), 0);
        TransferHelper.safeApprove(address(_token0), address(router), _token0Bought);

        TransferHelper.safeApprove(address(_token1), address(router), 0);
        TransferHelper.safeApprove(address(_token1), address(router), _token1Bought);

        (amountA, amountB, liquidity) = router.addLiquidity(
            _token0,
            _token1,
            _stable,
            _token0Bought,
            _token1Bought,
            1,
            1,
            address(this),
            DEADLINE
        );

        uint256 token0Residue = IERC20(_token0).balanceOf(address(this));
        if (token0Residue > 0) {
            TransferHelper.safeTransfer(_token0, msg.sender, token0Residue);
        }

        uint256 token1Residue = IERC20(_token1).balanceOf(address(this));
        if (token1Residue > 0) {
            TransferHelper.safeTransfer(_token1, msg.sender, token1Residue);
        }
    }

    function _breakAndSwapTokens(
        address _fromToken,
        address _token0,
        address _token1,
        bool _stable,
        uint256 _amount
    ) internal returns (uint256 token0Bought, uint256 token1Bought) {
        uint256 amountToSwap = _amount.div(2);
        if (_fromToken == _token0) {
            token1Bought = _swapTokensInternal(_fromToken, _token1, _stable, amountToSwap, 1);
            token0Bought = _amount.sub(amountToSwap);
        } else {
            token0Bought = _swapTokensInternal(_fromToken, _token0, _stable, amountToSwap, 1);
            token1Bought = _amount.sub(amountToSwap);
        }
        //add checks before and after swapping if needed
    }

    function _getPairTokens(address _pairAddress)
        internal
        view
        returns (
            address token0,
            address token1,
            bool stable
        )
    {
        IDystPair lpPair = IDystPair(_pairAddress);
        token0 = lpPair.token0();
        token1 = lpPair.token1();
        stable = lpPair.stable();
    }

    function _pullTokens(address _token, uint256 _amount) internal returns (uint256) {
        if (_token == address(0)) {
            require(msg.value > 0 && msg.value == _amount, "Incorrect native token amount sent");
            IWETH(address(weth)).deposit{value: msg.value}();
            return msg.value;
        }
        require(msg.value == 0, "native token amount sent with erc20 token");
        require(_amount > 0, "Invalid token amount");

        //transfer token from user to contract
        TransferHelper.safeTransferFrom(_token, msg.sender, address(this), _amount);
        return _amount;
    }

    function _swapTokensInternal(
        address _fromToken,
        address _toToken,
        bool _stable,
        uint256 _amountToSwap,
        uint256 _amountOutMin
    ) internal returns (uint256 tokenBought) {
        if (_fromToken == _toToken) {
            return _amountToSwap;
        }
        require(
            IERC20(_fromToken).balanceOf(address(this)) >= _amountToSwap,
            "Contract should have sufficient from token amount to swap"
        );

        TransferHelper.safeApprove(_fromToken, address(router), 0);
        TransferHelper.safeApprove(_fromToken, address(router), _amountToSwap);

        tokenBought = router.swapExactTokensForTokensSimple(
            _amountToSwap,
            _amountOutMin,
            _fromToken,
            _toToken,
            _stable,
            address(this),
            DEADLINE
        )[1];

        //since we swap directly, we are taking the last index as paths array is of length 2

        require(tokenBought > 0, "Error Swapping Tokens");
    }

    // Rescue any tokens that have not been able to processed by the contract
    function rescueFunds(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        TransferHelper.safeTransfer(address(_token), owner(), balance);
    }
}
