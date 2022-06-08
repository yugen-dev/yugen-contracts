// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IUserProxy.sol";
import "interfaces/IDystRouter01.sol";
import "../libraries/TransferHelper.sol";

contract PenroseFinanceStrategy is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    IERC20 public asset; //DystopiaLP address
    IERC20 public rewardA; //DYST token
    IERC20 public rewardB; //PEN token
    IUserProxy public userProxyInterfaceContract; //UserProxy Interface Contract contract of Penrose Finance
    address public ygnConverter; // YGN Converter address to receive DYST
    address public treasury; //Treasury Address to receive PEN
    address public farm; //Farm Address
    IDystRouter01 public dystRouter; //Router used to swap dyst to wmatic

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;
    address public constant wmatic = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    uint256 public strategyWithdrawalFeeBP = 0;
    uint256 public strategyDepositFeeBP = 0;
    uint256 public totalInputTokensStaked = 0;

    bool public supportsEmergencyWithdraw = false;
    bool public isStrategyEnabled = true;
    bool public convertDyst = true;
    // whitelisted liquidityHolders
    mapping(address => bool) public liquidityHolders;

    event SetYGNConverter(address indexed owner, address indexed ygnConverter);
    event SetTreasury(address indexed owner, address indexed treasury);
    event RescueAsset(address owner, uint256 rescuedAssetAmount);
    event LiquidityHolderStatus(address liquidityHolder, bool status);

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    modifier ensureValidTokenAddress(address _token) {
        require(_token != address(0), "No zero address");
        require(_token == address(asset), "Invalid token");
        _;
    }

    modifier ensureValidLiquidityHolder(address liquidityHolder) {
        require(liquidityHolder != address(0), "No zero address");
        require(liquidityHolders[liquidityHolder], "Invalid Liquidity Holder");
        _;
    }

    /**
     * @notice Creates a new PenroseFinance Strategy Contract
     * @param _asset Dystopia LP address
     * @param _rewardA DYST token address
     * @param _rewardB PEN token address
     * @param _userProxyInterfaceContract UserProxy Interface Contract contract of Penrose Finance
     * @param _ygnConverter fee address for transferring residues and reward tokens (DYST)
     * @param _treasury treasury Address to receive PEN
     * @param _farm Farm Address that deposits into this strategy
     * @param _dystRouter Router used to swap dyst to wmatic
     * @dev deployer of contract is set as owner
     */
    constructor(
        IERC20 _asset,
        IERC20 _rewardA,
        IERC20 _rewardB,
        IUserProxy _userProxyInterfaceContract,
        address _ygnConverter,
        address _treasury,
        address _farm,
        IDystRouter01 _dystRouter
    ) {
        asset = _asset;
        rewardA = _rewardA;
        rewardB = _rewardB;
        userProxyInterfaceContract = _userProxyInterfaceContract;
        ygnConverter = _ygnConverter;
        treasury = _treasury;
        farm = _farm;
        liquidityHolders[_farm] = true;
        dystRouter = _dystRouter;
        TransferHelper.safeApprove(address(rewardA), address(dystRouter), uint256(-1));
    }

    function updateLiquidityHolder(address _liquidityHolder, bool _status)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(_liquidityHolder)
    {
        liquidityHolders[_liquidityHolder] = _status;
        emit LiquidityHolderStatus(_liquidityHolder, _status);
    }

    /**
     * @notice Updates the Strategy Mode for the strategy
     * @param _isStrategyEnabled bool flag to enable disable strategy
     * @dev Only owner can call and update the strategy mode
     */
    function updateStrategyMode(bool _isStrategyEnabled) external onlyOwner nonReentrant {
        isStrategyEnabled = _isStrategyEnabled;
    }

    /**
     * @notice Updates the Convert Dyst flag for the strategy
     * @param _convertDyst bool flag to enable/disable conversion of dyst to wmatic
     * @dev Only owner can call and update this mode
     */
    function updateConvertDystMode(bool _convertDyst) external onlyOwner nonReentrant {
        convertDyst = _convertDyst;
    }

    /**
     * @notice Updates the emergency withdraw support Mode for the protocol
     * @param _supportsEmergencyWithdraw bool flag to enable disable if protocol supports emergency withdraw
     * @dev Only owner can call and update this
     */
    function updateSupportsEmergencyWithdraw(bool _supportsEmergencyWithdraw)
        external
        onlyOwner
        nonReentrant
    {
        supportsEmergencyWithdraw = _supportsEmergencyWithdraw;
    }

    /**
     * @notice Updates the Farm Address for the strategy
     * @param _farm Address of the farm
     * @dev Only owner can call and update the farm address
     */
    function updateFarmAddress(address _farm)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(_farm)
    {
        liquidityHolders[farm] = false;
        farm = _farm;
        liquidityHolders[farm] = true;
    }

    /**
     * @notice Updates the DystRouter Contract used for swaps
     * @param _dystRouter Address of the Dystopia Exchange Router
     * @dev Only owner can call and update the DystRouter Contract address
     */
    function updateDystRouter(IDystRouter01 _dystRouter)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_dystRouter))
    {
        dystRouter = _dystRouter;
    }

    /**
     * @notice Updates the UserProxy Interface Contract used by Penrose Finance
     * @param _userProxyInterfaceContract Address of the UserProxy Interface Contract
     * @dev Only owner can call and update the UserProxy Interface Contract address
     */
    function updateUserProxyInterfaceContract(IUserProxy _userProxyInterfaceContract)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_userProxyInterfaceContract))
    {
        userProxyInterfaceContract = _userProxyInterfaceContract;
    }

    /**
     * @notice Updates the Dystopia LP Token Address.
     * @param _asset Address of the Dystopia LP
     * @dev Only owner can call and update the Dystopia LP address
     */
    function updateAsset(IERC20 _asset)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_asset))
    {
        asset = _asset;
    }

    /**
     * @notice Can be used by the owner to update the address for reward token
     * @param _rewardA ERC20 address for the new reward token
     * @param _rewardB ERC20 address for the new reward token
     * @dev Only owner can call and update the rewardToken.
     */
    function updateRewardToken(IERC20 _rewardA, IERC20 _rewardB)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_rewardA))
        ensureNonZeroAddress(address(_rewardB))
    {
        rewardA = _rewardA;
        rewardB = _rewardB;
    }

    // Update YGN Converter
    function setYGNConverter(address _ygnConverter)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(_ygnConverter)
    {
        ygnConverter = _ygnConverter;
        emit SetYGNConverter(_msgSender(), _ygnConverter);
    }

    // Update Treasury
    function setTreasury(address _treasury)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(_treasury)
    {
        treasury = _treasury;
        emit SetTreasury(_msgSender(), _treasury);
    }

    /**
     * @notice transfer accumulated asset. Shouldn't be called since this will transfer community's residue asset to ygnConverter
     * @dev Only owner can call and claim the assets residue
     */
    function transferAssetResidue() external onlyOwner nonReentrant {
        updatePool();
        uint256 assetResidue = asset.balanceOf(address(this));
        if (assetResidue > 0) {
            TransferHelper.safeTransfer(address(asset), ygnConverter, assetResidue);
        }
    }

    /**
     * @notice transfer accumulated reward tokens.
     * @dev Only owner can call and claim the reward tokens residue
     */
    function transferRewardTokenRewards() external onlyOwner nonReentrant {
        updatePool();

        uint256 rewardARewards = rewardA.balanceOf(address(this));
        if (rewardARewards > 0) {
            if (convertDyst) {
                dystRouter.swapExactTokensForTokensSimple(
                    rewardARewards,
                    1,
                    address(rewardA),
                    address(wmatic),
                    false,
                    ygnConverter,
                    DEADLINE
                );
            } else {
                TransferHelper.safeTransfer(address(rewardA), ygnConverter, rewardARewards);
            }
        }

        uint256 rewardBRewards = rewardB.balanceOf(address(this));
        if (rewardBRewards > 0) {
            TransferHelper.safeTransfer(address(rewardB), treasury, rewardBRewards);
        }
    }

    /**
     * @dev function to claim DYST and PEN rewards
     */
    function _claimRewards() internal {
        userProxyInterfaceContract.claimStakingRewards();
    }

    /**
     * @notice Update reward variables of the pool to be up-to-date. This also claims the rewards generated from staking
     */
    function updatePool() public {
        if (totalInputTokensStaked == 0) {
            return;
        }

        _claimRewards();

        uint256 rewardARewards = rewardA.balanceOf(address(this));
        if (rewardARewards > 0) {
            if (convertDyst) {
                dystRouter.swapExactTokensForTokensSimple(
                    rewardARewards,
                    1,
                    address(rewardA),
                    address(wmatic),
                    false,
                    ygnConverter, //wmatic directly goes to ygn convertor
                    DEADLINE
                );
            } else {
                TransferHelper.safeTransfer(address(rewardA), ygnConverter, rewardARewards);
            }
        }

        uint256 rewardBRewards = rewardB.balanceOf(address(this));
        if (rewardBRewards > 0) {
            TransferHelper.safeTransfer(address(rewardB), treasury, rewardBRewards);
        }
    }

    /**
     * @notice function to deposit asset to Penrose/Dystopia pools.
     * @param _token Address of the token. (Should be the same as the asset token)
     * @param _amount amount of asset token deposited.
     * @dev Can only be called from the liquidity manager
     */
    function deposit(address _token, uint256 _amount)
        external
        ensureValidTokenAddress(_token)
        ensureValidLiquidityHolder(msg.sender)
        nonReentrant
        returns (uint256 depositedAmount)
    {
        require(isStrategyEnabled, "Strategy is disabled");
        updatePool();
        if (_amount > 0) {
            TransferHelper.safeTransferFrom(
                address(asset),
                address(msg.sender),
                address(this),
                _amount
            );
            depositedAmount = _depositAsset(_amount);
        }
        totalInputTokensStaked = totalInputTokensStaked.add(_amount);
    }

    /**
     * @dev function to deposit asset from strategy to Penrose/Dystopia.
     */
    function _depositAsset(uint256 _amount) internal returns (uint256 depositedAmount) {
        TransferHelper.safeApprove(address(asset), address(userProxyInterfaceContract), _amount);
        userProxyInterfaceContract.depositLpAndStake(address(asset), _amount);
        depositedAmount = _amount;
    }

    /**
     * @notice function to withdraw asset from Penrose/Dystopia.
     * @param _token Address of the token. (Should be the same as the asset token)
     * @param _amount amount of asset token the user wants to withdraw.
     * @dev Can only be called from the liquidity manager
     */
    function withdraw(address _token, uint256 _amount)
        external
        ensureValidTokenAddress(_token)
        ensureValidLiquidityHolder(msg.sender)
        nonReentrant
        returns (uint256 withdrawnAmount)
    {
        if (_amount > 0) {
            if (isStrategyEnabled) {
                updatePool();
                withdrawnAmount = _withdrawAsset(_amount);
            } else {
                withdrawnAmount = _getWithdrawableAmount(_amount);
            }
            TransferHelper.safeApprove(address(asset), address(msg.sender), withdrawnAmount);
        }
        totalInputTokensStaked = totalInputTokensStaked.sub(_amount);
    }

    /**
     * @dev function to withdraw asset from Penrose/Dystopia to strategy
     */
    function _withdrawAsset(uint256 _amountToWithdraw) internal returns (uint256 withdrawnAmount) {
        userProxyInterfaceContract.unstakeLpAndWithdraw(address(asset), _amountToWithdraw);
        withdrawnAmount = _amountToWithdraw;
    }

    /**
     * @notice function to withdraw all asset and transfer back to liquidity holder.
     * @param _token Address of the token. (Should be the same as the asset token)
     * @dev Can only be called by the owner
     */
    function rescueFunds(address _token)
        external
        ensureValidTokenAddress(_token)
        onlyOwner
        nonReentrant
        returns (uint256 rescuedAssetAmount)
    {
        updatePool();

        if (totalInputTokensStaked > 0) {
            _withdrawAsset(totalInputTokensStaked);
            rescuedAssetAmount = asset.balanceOf(address(this));
            emit RescueAsset(msg.sender, rescuedAssetAmount);
            isStrategyEnabled = false;
        }
    }

    function _getWithdrawableAmount(uint256 _amount)
        internal
        view
        returns (uint256 withdrawableAmount)
    {
        uint256 totalBalance = asset.balanceOf(address(this));
        uint256 totalAmount = totalBalance >= totalInputTokensStaked
            ? totalInputTokensStaked
            : totalBalance;
        withdrawableAmount = _amount.mul(totalAmount).div(totalInputTokensStaked);
    }
}
