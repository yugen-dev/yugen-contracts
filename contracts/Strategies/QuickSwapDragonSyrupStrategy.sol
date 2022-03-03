// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IStakingRewards.sol";
import "interfaces/IStrategy.sol";
import "../libraries/TransferHelper.sol";

contract QuickSwapDragonSyrupStrategy is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    IERC20 public asset; //quick address which is used in stakingRewardsContract
    IERC20 public rewardToken; //the reward token UART etc.
    IStakingRewards public stakingRewardsContract; //StakingRewards contract of QuickSwap
    address public ygnConverter; // YGN Converter address
    address public farm; //Farm Address

    uint256 public strategyWithdrawalFeeBP = 0;
    uint256 public strategyDepositFeeBP = 0;
    uint256 public totalInputTokensStaked = 0;

    bool public supportsEmergencyWithdraw = true;
    bool public isStrategyEnabled = true;
    // whitelisted liquidityHolders
    mapping(address => bool) public liquidityHolders;

    event SetYGNConverter(address indexed owner, address indexed ygnConverter);
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
     * @notice Creates a new QuickSwap DragonSyrup Strategy Contract
     * @param _asset same which is used in stakingRewardsContract. This will quick token
     * @param _rewardToken reward token address
     * @param _stakingRewardsContract; staking rewards contract used by dragon syrup
     * @param _ygnConverter fee address for transferring residues and reward tokens
     * @param _farm Farm Address that deposits into this strategy
     * @dev deployer of contract is set as owner
     */
    constructor(
        IERC20 _asset,
        IERC20 _rewardToken,
        IStakingRewards _stakingRewardsContract,
        address _ygnConverter,
        address _farm
    ) {
        asset = _asset;
        rewardToken = _rewardToken;
        stakingRewardsContract = _stakingRewardsContract;
        ygnConverter = _ygnConverter;
        farm = _farm;
        liquidityHolders[_farm] = true;
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
     * @notice Updates the Staking Contract used by QuickSwap
     * @param _stakingRewardsContract Address of the Staking Contract
     * @dev Only owner can call and update the Staking Contract address
     */
    function updateQuickSwapStakingRewardsContract(IStakingRewards _stakingRewardsContract)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_stakingRewardsContract))
    {
        stakingRewardsContract = _stakingRewardsContract;
    }

    /**
     * @notice Updates the QuickSwap LP Token Address.
     * @param _asset Address of the QuickSwap LP
     * @dev Only owner can call and update the QuickSwap LP address
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
     * @param _rewardToken ERC20 address for the new reward token
     * @dev Only owner can call and update the rewardToken.
     */
    function updateRewardToken(IERC20 _rewardToken)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_rewardToken))
    {
        rewardToken = _rewardToken;
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
        uint256 rewardTokenRewards = rewardToken.balanceOf(address(this));
        if (rewardTokenRewards > 0) {
            TransferHelper.safeTransfer(address(rewardToken), ygnConverter, rewardTokenRewards);
        }
    }

    /**
     * @dev View function to see pending rewards by QUICK Swap Staking Contracts.
     */
    function getStakingRewards() public view returns (uint256 pendingRewards) {
        pendingRewards = stakingRewardsContract.earned(address(this));
    }

    /**
     * @dev View function to get total LP staked in Staking Contracts.
     */
    function getTotalLPStaked() public view returns (uint256 totalLPStaked) {
        totalLPStaked = stakingRewardsContract.balanceOf(address(this));
    }

    /**
     * @dev function to claim reward token rewards
     */
    function _claimRewards() internal {
        stakingRewardsContract.getReward();
    }

    /**
     * @notice View function to see pending rewards on frontend.
     */
    function getPendingRewards() external view returns (uint256 pendingRewards) {
        pendingRewards = getStakingRewards();
    }

    /**
     * @notice Update reward variables of the pool to be up-to-date. This also claims the rewards generated from staking
     */
    function updatePool() public {
        uint256 totalLPStaked = getTotalLPStaked();
        if (totalLPStaked == 0) {
            return;
        }

        uint256 pendingRewards = getStakingRewards();
        if (pendingRewards > 0) {
            _claimRewards();
        } else {
            // when no rewards are present
            return;
        }
        uint256 rewardTokenRewards = rewardToken.balanceOf(address(this));
        TransferHelper.safeTransfer(address(rewardToken), ygnConverter, rewardTokenRewards);
    }

    /**
     * @notice function to deposit asset to quickswap farms.
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
     * @dev function to deposit asset from strategy to Quickswap Staking Contract.
     */
    function _depositAsset(uint256 _amount) internal returns (uint256 depositedAmount) {
        TransferHelper.safeApprove(address(asset), address(stakingRewardsContract), _amount);
        stakingRewardsContract.stake(_amount);
        depositedAmount = _amount;
    }

    /**
     * @notice function to withdraw asset from quickswap farms.
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
     * @dev function to withdraw asset from Quickswap Staking Contract to strategy
     */
    function _withdrawAsset(uint256 _amountToWithdraw) internal returns (uint256 withdrawnAmount) {
        stakingRewardsContract.withdraw(_amountToWithdraw);
        withdrawnAmount = _amountToWithdraw;
    }

    /**
     * @dev function to withdraw asset from Quickswap Staking Contract to strategy
     */
    function _emergencyWithdrawAsset() internal {
        stakingRewardsContract.exit();
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
        uint256 totalLPStaked = getTotalLPStaked();

        if (totalLPStaked > 0) {
            if (supportsEmergencyWithdraw) {
                _emergencyWithdrawAsset();
            } else {
                _withdrawAsset(totalLPStaked);
            }
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

    /* 
        Requires new strategy contract to be whitelisted by current strategy.
        Requires changing strategy address in farm.
    */
    /**
     * @notice function to withdraw all asset and transfer back to new strategy.
     * @param _newStrategy Address of new strategy contract
     * @dev Can only be called by the owner
     */
    function switchStrategy(IStrategy _newStrategy)
        external
        ensureNonZeroAddress(address(_newStrategy))
        onlyOwner
        nonReentrant
    {
        updatePool();
        uint256 totalLPStaked = getTotalLPStaked();
        require(totalLPStaked > 0, "No tokens staked");
        _withdrawAsset(totalLPStaked);
        require(asset.balanceOf(address(this)) >= totalLPStaked, "Unsuccessful strategy withdraw");
        TransferHelper.safeApprove(address(asset), address(_newStrategy), totalLPStaked);
        uint256 depositedAmount = _newStrategy.deposit(address(asset), totalLPStaked);
        require(depositedAmount == totalLPStaked, "Invalid new strategy deposit");
        emit StrategySwitched(IStrategy(address(this)), _newStrategy);
        totalInputTokensStaked = 0;
    }
}
