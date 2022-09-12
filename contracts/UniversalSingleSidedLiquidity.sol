// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "interfaces/IUniswapV2Router.sol";
import "interfaces/IUniswapV2Pair.sol";
import "interfaces/IUniswapV2Factory.sol";
import "interfaces/IWETH.sol";
import "./libraries/TransferHelper.sol";

contract UniversalSingleSidedLiquidity is ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    using Address for address;
    using SafeERC20 for IERC20;

    IUniswapV2Factory public immutable uniswapV2Factory;
    IUniswapV2Router public immutable uniswapV2Router;
    IERC20 public immutable weth;

    address private recipient;
    uint256 private slippageAdjustedMinLP;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    constructor(IUniswapV2Router _router, IERC20 _weth) {
        require(address(_router) != address(0), "No zero address");
        require(
            address(IUniswapV2Factory(_router.factory())) != address(0),
            "Invalid Factory address"
        );
        require(address(_weth) != address(0), "No zero address");
        uniswapV2Router = _router;
        uniswapV2Factory = IUniswapV2Factory(_router.factory());
        weth = _weth;
    }

    /**
     * @dev Fallback function for receiving native token after sending wrapped token
     */
    receive() external payable {
        assert(msg.sender == address(weth)); // only accept native token via fallback from the wrapped contract
    }

    event PooledLiquidity(
        address sender,
        address pool,
        address tokenA,
        uint256 amountA,
        address tokenB,
        uint256 amountB
    );

    function poolLiquidityUniswapV2(
        address _userAddress,
        address _fromToken,
        uint256 _fromTokenAmount,
        address _pairAddress,
        address _toToken,
        uint256 _slippageAdjustedMinLP,
        address[] memory _swapPathForToToken
    ) public payable nonReentrant returns (uint256 lpBought) {
        (address token0, address token1) = _getPairTokensUniswapV2(_pairAddress);
        require(
            _toToken == token0 || _toToken == token1,
            "_toToken not an underlying token of _pairAddress"
        );

        recipient = _userAddress;
        slippageAdjustedMinLP = _slippageAdjustedMinLP;

        uint256 toInvest = _pullTokens(_fromToken, _fromTokenAmount);

        bool isFromTokenNative = false;
        if (_fromToken == address(0)) {
            _fromToken = address(weth);
            isFromTokenNative = true;
        }

        if (_fromToken != token0 && _fromToken != token1) {
            require(_swapPathForToToken.length >= 2, "Swap Path is incorrrect/empty");

            uint256 _amountOut = 1;

            if (slippageAdjustedMinLP > 0) {
                _amountOut = uniswapV2Router.getAmountsOut(_fromTokenAmount, _swapPathForToToken)[
                    _swapPathForToToken.length - 1
                ];
                require(
                    _isWithinDesiredSlippageUniswapV2(_amountOut, _toToken, _pairAddress),
                    "Estimated Received LPs less than minimum needed LPs"
                );
            }
            toInvest = _swapTokensInternalUniswapV2(
                _fromToken,
                _toToken,
                _fromTokenAmount,
                _amountOut,
                _swapPathForToToken
            );
            lpBought = _poolLiquidityUniswapV2(_toToken, _pairAddress, toInvest);

            //Returning Residue in from token amount, if any. If it was eth, then we send eth
            uint256 fromTokenResidue = IERC20(_fromToken).balanceOf(address(this));
            if (fromTokenResidue > 0) {
                if (isFromTokenNative) {
                    IWETH(address(weth)).withdraw(fromTokenResidue);
                    TransferHelper.safeTransferETH(recipient, fromTokenResidue);
                } else {
                    TransferHelper.safeTransfer(_fromToken, recipient, fromTokenResidue);
                }
            }
        } else {
            require(
                _isWithinDesiredSlippageUniswapV2(toInvest, _fromToken, _pairAddress),
                "Estimated Received LPs less than minimum needed LPs"
            );
            lpBought = _poolLiquidityUniswapV2(_fromToken, _pairAddress, toInvest);
        }

        TransferHelper.safeTransfer(_pairAddress, msg.sender, lpBought);
    }

    function _isWithinDesiredSlippageUniswapV2(
        uint256 _amountIn,
        address _fromToken,
        address _pairAddress
    ) internal view returns (bool) {
        uint256 estimatedLps = getEstimatedLPTokensUniswapV2(_amountIn, _fromToken, _pairAddress);
        return estimatedLps < slippageAdjustedMinLP ? false : true;
    }

    function _pullTokens(address _token, uint256 _amount) internal returns (uint256) {
        if (_token == address(0)) {
            require(msg.value > 0 && msg.value == _amount, "Incorrect native token amount sent");
            IWETH(address(weth)).deposit{value: msg.value}();
            return msg.value;
        }
        require(_amount > 0, "Invalid from token amount");
        require(msg.value == 0, "native token amount sent with erc20 token");

        //transfer token from user to contract
        TransferHelper.safeTransferFrom(_token, msg.sender, address(this), _amount);
        return _amount;
    }

    function _poolLiquidityUniswapV2(
        address _fromToken,
        address _pairAddress,
        uint256 _amount
    ) internal returns (uint256) {
        (address _token0, address _token1) = _getPairTokensUniswapV2(_pairAddress);

        // divide intermediate into appropriate amount to add liquidity
        (uint256 token0Bought, uint256 token1Bought) = _swapTokensUniswapV2(
            _fromToken,
            _token0,
            _token1,
            _amount
        );

        (uint256 lpAmount, uint256 amountA, uint256 amountB) = _poolDepositUniswapV2(
            _token0,
            _token1,
            token0Bought,
            token1Bought
        );

        emit PooledLiquidity(msg.sender, _pairAddress, _token0, amountA, _token1, amountB);

        return lpAmount;
    }

    function _poolDepositUniswapV2(
        address _token0,
        address _token1,
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
        TransferHelper.safeApprove(address(_token0), address(uniswapV2Router), 0);
        TransferHelper.safeApprove(address(_token0), address(uniswapV2Router), _token0Bought);

        TransferHelper.safeApprove(address(_token1), address(uniswapV2Router), 0);
        TransferHelper.safeApprove(address(_token1), address(uniswapV2Router), _token1Bought);

        (amountA, amountB, liquidity) = uniswapV2Router.addLiquidity(
            _token0,
            _token1,
            _token0Bought,
            _token1Bought,
            1,
            1,
            address(this),
            DEADLINE
        );

        uint256 token0Residue = IERC20(_token0).balanceOf(address(this));
        if (token0Residue > 0) {
            TransferHelper.safeTransfer(_token0, recipient, token0Residue);
        }

        uint256 token1Residue = IERC20(_token1).balanceOf(address(this));
        if (token1Residue > 0) {
            TransferHelper.safeTransfer(_token1, recipient, token1Residue);
        }
    }

    function _swapTokensUniswapV2(
        address _fromToken,
        address _toToken0,
        address _toToken1,
        uint256 _amount
    ) internal returns (uint256 token0Bought, uint256 token1Bought) {
        IUniswapV2Pair pair = IUniswapV2Pair(uniswapV2Factory.getPair(_toToken0, _toToken1));
        (uint256 res0, uint256 res1, ) = pair.getReserves();
        uint256 _amountOut = 1;
        address[] memory swapPath = new address[](2);

        if (_fromToken == _toToken0) {
            uint256 amountToSwap = getSwapAmtUniswapV2(res0, _amount);
            //if no reserve or a new pair is created
            if (amountToSwap <= 0) amountToSwap = _amount.div(2);
            if (slippageAdjustedMinLP > 0) {
                _amountOut = uniswapV2Router.getAmountOut(amountToSwap, res0, res1);
            }
            swapPath[0] = _fromToken;
            swapPath[1] = _toToken1;
            token1Bought = _swapTokensInternalUniswapV2(
                _fromToken,
                _toToken1,
                amountToSwap,
                _amountOut,
                swapPath
            );
            token0Bought = _amount.sub(amountToSwap);
        } else {
            uint256 amountToSwap = getSwapAmtUniswapV2(res1, _amount);
            //if no reserve or a new pair is created
            if (amountToSwap <= 0) amountToSwap = _amount.div(2);
            if (slippageAdjustedMinLP > 0) {
                _amountOut = uniswapV2Router.getAmountOut(amountToSwap, res1, res0);
            }
            swapPath[0] = _fromToken;
            swapPath[1] = _toToken0;
            token0Bought = _swapTokensInternalUniswapV2(
                _fromToken,
                _toToken0,
                amountToSwap,
                _amountOut,
                swapPath
            );
            token1Bought = _amount.sub(amountToSwap);
        }
    }

    function _swapTokensInternalUniswapV2(
        address _fromToken,
        address _toToken,
        uint256 _amountToSwap,
        uint256 _amountOutMin,
        address[] memory _swapPath
    ) internal returns (uint256 tokenBought) {
        if (_fromToken == _toToken) {
            return _amountToSwap;
        }
        require(
            IERC20(_fromToken).balanceOf(address(this)) >= _amountToSwap,
            "Contract should have sufficient from token amount to swap"
        );

        TransferHelper.safeApprove(_fromToken, address(uniswapV2Router), 0);
        TransferHelper.safeApprove(_fromToken, address(uniswapV2Router), _amountToSwap);

        tokenBought = uniswapV2Router.swapExactTokensForTokens(
            _amountToSwap,
            _amountOutMin,
            _swapPath,
            address(this),
            DEADLINE
        )[_swapPath.length - 1];

        require(tokenBought > 0, "Error Swapping Tokens");
    }

    function getEstimatedLPTokensUniswapV2(
        uint256 _amountIn,
        address _fromToken,
        address _pairAddress
    ) public view returns (uint256 estimatedLps) {
        (uint256 res0, uint256 res1, ) = IUniswapV2Pair(_pairAddress).getReserves();
        (address _token0, address _token1) = _getPairTokensUniswapV2(_pairAddress);
        uint256 amountToSwap;
        if (_fromToken == _token0) {
            amountToSwap = getSwapAmtUniswapV2(res0, _amountIn);
            estimatedLps = _amountIn.sub(amountToSwap).mul(IERC20(_pairAddress).totalSupply()).div(
                res0
            );
        } else if (_fromToken == _token1) {
            amountToSwap = getSwapAmtUniswapV2(res1, _amountIn);
            estimatedLps = _amountIn.sub(amountToSwap).mul(IERC20(_pairAddress).totalSupply()).div(
                res1
            );
        }
    }

    function _getPairTokensUniswapV2(address _pairAddress)
        internal
        view
        returns (address token0, address token1)
    {
        IUniswapV2Pair pair = IUniswapV2Pair(_pairAddress);
        token0 = pair.token0();
        token1 = pair.token1();
    }

    function getSwapAmtUniswapV2(uint256 reserveIn, uint256 userIn)
        internal
        pure
        returns (uint256)
    {
        return
            sqrt(reserveIn.mul(userIn.mul(3988000).add(reserveIn.mul(3988009)))).sub(
                reserveIn.mul(1997)
            ) / 1994;
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    // Rescue any tokens that have not been able to processed by the contract
    function rescueFunds(address _token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        TransferHelper.safeTransfer(address(_token), owner(), balance);
    }
}
