// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IUniswapV2Factory.sol";
import "interfaces/IUniswapV2Router.sol";
import "interfaces/IUniswapV2Pair.sol";

contract FirstBuy is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    IERC20 public ygn;
    IERC20 public secondaryToken;

    address public lpTokensReceiver;
    address public ygnTokensReceiver;

    IUniswapV2Router public router;
    IUniswapV2Factory public factory;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    event SetLPTokensReceiver(address indexed owner, address indexed lpTokensReceiver);
    event SetYGNTokensReceiver(address indexed owner, address indexed ygnTokensReceiver);
    event YGNDeposited(address indexed owner, IERC20 indexed ygn, uint256 indexed amount);
    event SecondaryTokenDeposited(
        address indexed owner,
        IERC20 indexed secondaryToken,
        uint256 indexed amount
    );
    event FirstBuyCompleted(uint256 indexed lpReceived, uint256 ygnPurchased);
    event RescueFunds(address indexed token, uint256 indexed amount);

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    /**
     * @notice Construct a new First Buy Contract
     * @param _ygn YGN token address
     * @param _secondaryToken secondary token address
     * @param _router Router to be used for adding liquidity
     * @param _lpTokensReceiver LP tokens receiver address
     * @param _ygnTokensReceiver YGN tokens receiver address
     * @dev deployer of contract is set as owner
     */
    constructor(
        IERC20 _ygn,
        IERC20 _secondaryToken,
        IUniswapV2Router _router,
        address _lpTokensReceiver,
        address _ygnTokensReceiver
    ) {
        ygn = _ygn;
        secondaryToken = _secondaryToken;
        router = _router;
        factory = IUniswapV2Factory(router.factory());
        require(address(factory) != address(0), "Invalid factory address");
        lpTokensReceiver = _lpTokensReceiver;
        ygnTokensReceiver = _ygnTokensReceiver;
    }

    //Only Owner Functions

    /**
     * @notice Update LP tokens receiver address
     * @param _newLPTokensReceiver New address that should receive the LP tokens
     */
    function updateLPTokensReceiver(address _newLPTokensReceiver)
        external
        onlyOwner
        ensureNonZeroAddress(_newLPTokensReceiver)
    {
        lpTokensReceiver = _newLPTokensReceiver;
        emit SetLPTokensReceiver(msg.sender, _newLPTokensReceiver);
    }

    /**
     * @notice Update YGN tokens receiver address
     * @param _newYGNTokensReceiver New address that should receive the YGN tokens
     */
    function updateYGNTokensReceiver(address _newYGNTokensReceiver)
        external
        onlyOwner
        ensureNonZeroAddress(_newYGNTokensReceiver)
    {
        ygnTokensReceiver = _newYGNTokensReceiver;
        emit SetYGNTokensReceiver(msg.sender, _newYGNTokensReceiver);
    }

    /**
     * @notice Update YGN address
     * @param _ygn YGN token address
     */
    function updateYGN(IERC20 _ygn) external onlyOwner ensureNonZeroAddress(address(_ygn)) {
        ygn = _ygn;
    }

    /**
     * @notice Update secondary address
     * @param _secondaryToken secondary token address (to be used along side YGN)
     */
    function updateSecondaryToken(IERC20 _secondaryToken)
        external
        onlyOwner
        ensureNonZeroAddress(address(_secondaryToken))
    {
        secondaryToken = _secondaryToken;
    }

    /**
     * @notice Update router address
     * @param _router router address
     */
    function updateRouter(IUniswapV2Router _router)
        external
        onlyOwner
        ensureNonZeroAddress(address(_router))
    {
        router = _router;
        factory = IUniswapV2Factory(router.factory());
        require(address(factory) != address(0), "Invalid factory address");
    }

    /**
     * @notice Deposit YGN in the contract to be used for adding liquidity
     * @param _amount Amount of YGN token to be deposited
     */
    function depositYGN(uint256 _amount) external onlyOwner nonReentrant {
        ygn.safeTransferFrom(_msgSender(), address(this), _amount);
        emit YGNDeposited(_msgSender(), ygn, _amount);
    }

    /**
     * @notice Deposit seconday token in the contract to be used for adding liquidity
     * @param _amount Amount of secondary token to be deposited
     */
    function depositSecondaryToken(uint256 _amount) external onlyOwner nonReentrant {
        secondaryToken.safeTransferFrom(_msgSender(), address(this), _amount);
        emit SecondaryTokenDeposited(_msgSender(), secondaryToken, _amount);
    }

    /**
     * @notice This function is used to add liquidity for YGN and secondary token.
     * @param _ygnAmountToBuyLP YGN Amount to be used for adding liquidity
     * @param _secondaryTokenAmountToBuyLP Secondary Token Amount to be used for adding liquidity
     * @return lpReceived Amount of LP received
     * @return ygnPurchased Amount of YGN purchased
     */
    function firstBuy(uint256 _ygnAmountToBuyLP, uint256 _secondaryTokenAmountToBuyLP)
        external
        onlyOwner
        nonReentrant
        returns (uint256 lpReceived, uint256 ygnPurchased)
    {
        require(ygn.balanceOf(address(this)) >= _ygnAmountToBuyLP, "Insufficient YGN balance");
        require(
            secondaryToken.balanceOf(address(this)) > _secondaryTokenAmountToBuyLP,
            "Insufficient secondary token balance"
        );

        //Approve Router
        ygn.safeApprove(address(router), 0);
        ygn.safeApprove(address(router), _ygnAmountToBuyLP);
        secondaryToken.safeApprove(address(router), 0);
        secondaryToken.safeApprove(address(router), _secondaryTokenAmountToBuyLP);

        //Add liquidity
        (, , lpReceived) = router.addLiquidity(
            address(ygn),
            address(secondaryToken),
            _ygnAmountToBuyLP,
            _secondaryTokenAmountToBuyLP,
            1,
            1,
            lpTokensReceiver,
            DEADLINE
        );
        require(lpReceived > 0, "Error Adding Liquidity");

        //Buy YGN with amount left.

        uint256 totalSecondaryTokenAmount = secondaryToken.balanceOf(address(this));

        require(totalSecondaryTokenAmount > 0, "Insufficient secondary token balance");

        secondaryToken.safeApprove(address(router), 0);
        secondaryToken.safeApprove(address(router), totalSecondaryTokenAmount);

        address[] memory path = new address[](2);
        path[0] = address(secondaryToken);
        path[1] = address(ygn);

        ygnPurchased = router.swapExactTokensForTokens(
            totalSecondaryTokenAmount,
            1,
            path,
            ygnTokensReceiver,
            DEADLINE
        )[path.length - 1];

        require(ygnPurchased > 0, "Error Swapping Tokens");

        emit FirstBuyCompleted(lpReceived, ygnPurchased);

        _transferTokenResiduesToOwner();
    }

    /**
     * @notice Rescue any tokens that have not been able to processed by the contract. Can also be used to rescue LPs
     * @param _token Address of the token to be rescued
     */
    function rescueFunds(address _token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        IERC20(_token).safeTransfer(owner(), balance);
        emit RescueFunds(_token, balance);
    }

    //internal functions

    function _transferTokenResiduesToOwner() internal {
        uint256 ygnAmountLeft = ygn.balanceOf(address(this));
        if (ygnAmountLeft > 0) ygn.safeTransfer(owner(), ygnAmountLeft);

        uint256 secondaryTokenAmountLeft = secondaryToken.balanceOf(address(this));
        if (secondaryTokenAmountLeft > 0)
            secondaryToken.safeTransfer(owner(), secondaryTokenAmountLeft);
    }

    //View Functions

    function getLPTokenAddress() external view returns (IUniswapV2Pair lpTokenAddress) {
        lpTokenAddress = IUniswapV2Pair(
            IUniswapV2Factory(factory).getPair(address(ygn), address(secondaryToken))
        );
    }
}
