// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IMasterChef.sol";
import "interfaces/IStrategy.sol";
import "../libraries/TransferHelper.sol";

contract NachoXYZStrategy is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    IERC20 public asset; //LP token address which is used in masterchefContract
    IERC20 public rewardToken; //nshare
    IMasterChef public masterChefContract; //MasterChef contract of NachoXYZ (polygon)
    address public ygnConverter; // YGN Converter address
    address public farm; //Farm Address
    uint256 public pid; //pid of pool in which we need to deposit

    uint256 public strategyWithdrawalFeeBP = 0;
    uint256 public strategyDepositFeeBP = 0;
    uint256 public totalInputTokensStaked = 0;

    bool public supportsEmergencyWithdraw = true;
    bool public isStrategyEnabled = true;

    // whitelisted liquidityHolders
    mapping(address => bool) public liquidityHolders;

    event SetYGNConverter(address indexed user, address indexed ygnConverter);
    event RescueAsset(address farm, uint256 rescuedAssetAmount);
    event LiquidityHolderStatus(address liquidityHolder, bool status);

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    modifier ensureValidTokenAddress(address _token) {
        require(_token != address(0), "No zero address");
        require(_token == address(asset), "Invalid token for deposit/withdraw");
        _;
    }

    modifier ensureValidLiquidityHolder(address liquidityHolder) {
        require(liquidityHolder != address(0), "No zero address");
        require(liquidityHolders[liquidityHolder], "Invalid Liquidity Holder");
        _;
    }

    /**
     * @notice Creates a new NachoXYZ Strategy Contract
     * @param _asset same which is used in masterChefContract. ETH in this strategy.
     * @param _rewardToken NShare token address
     * @param _masterChefContract; staking rewards contract used by LP token
     * @param _ygnConverter fee address for transferring residues and reward tokens
     * @param _farm Farm Address that deposits into this strategy
     * @param _pid Pool id in the farm for this LP
     * @dev deployer of contract is set as owner
     */
    constructor(
        IERC20 _asset, // WETH-NACHO
        IERC20 _rewardToken,
        IMasterChef _masterChefContract,
        address _ygnConverter,
        address _farm,
        uint256 _pid
    ) {
        asset = _asset;
        rewardToken = _rewardToken;
        masterChefContract = _masterChefContract;
        ygnConverter = _ygnConverter;
        farm = _farm;
        pid = _pid;
        liquidityHolders[_farm] = true;
    }

    function updateLiquidityHolder(address _liquidityHolder, bool _status)
        external
        onlyOwner
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
    function updateStrategyMode(bool _isStrategyEnabled) external onlyOwner {
        isStrategyEnabled = _isStrategyEnabled;
    }

    /**
     * @notice Updates the emergency withdraw support Mode for the protocol
     * @param _supportsEmergencyWithdraw bool flag to enable disable if protocol supports emergency withdraw
     * @dev Only owner can call and update this
     */
    function updateSupportsEmergencyWithdraw(bool _supportsEmergencyWithdraw) external onlyOwner {
        supportsEmergencyWithdraw = _supportsEmergencyWithdraw;
    }

    /**
     * @notice Updates the Farm Address for the strategy
     * @param _farm Address of the farm
     * @dev Only owner can call and update the farm address
     */
    function updateFarmAddress(address _farm) external onlyOwner ensureNonZeroAddress(_farm) {
        liquidityHolders[farm] = false;
        farm = _farm;
        liquidityHolders[farm] = true;
    }

    /**
     * @notice Updates the MasterChef Contract used by NachoXYZ
     * @param _masterChefContract Address of the MasterChef Contract
     * @dev Only owner can call and update the MasterChef Contract address
     */
    function updateMasterChefContract(IMasterChef _masterChefContract)
        external
        onlyOwner
        ensureNonZeroAddress(address(_masterChefContract))
    {
        masterChefContract = _masterChefContract;
    }

    /**
     * @notice Updates the NachoXYZ LP Token Address.
     * @param _asset Address of the NachoXYZ LP
     * @dev Only owner can call and update the NachoXYZ LP address
     */
    function updateAsset(IERC20 _asset) external onlyOwner ensureNonZeroAddress(address(_asset)) {
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
        ensureNonZeroAddress(address(_rewardToken))
    {
        rewardToken = _rewardToken;
    }

    /**
     * @notice Can be used by the owner to update the pid of the farm. Shouldn't be used unless no funds are added
     * @param _pid Pool ID of the LP token in the farm
     * @dev Only owner can call and update the poolID.
     */
    function updatePoolID(uint256 _pid) external onlyOwner {
        pid = _pid;
    }

    // Update YGN Converter
    function setYGNConverter(address _ygnConverter)
        external
        onlyOwner
        ensureNonZeroAddress(_ygnConverter)
    {
        ygnConverter = _ygnConverter;
        emit SetYGNConverter(_msgSender(), _ygnConverter);
    }

    /**
     * @notice transfer accumulated asset. Shouldn't be called since this will transfer community's residue asset to ygnConverter
     * @dev Only owner can call and claim the assets residue
     */
    function transferAssetResidue() external onlyOwner {
        updatePool();
        uint256 assetResidue = asset.balanceOf(address(this));
        TransferHelper.safeTransfer(address(asset), ygnConverter, assetResidue);
    }

    /**
     * @notice transfer accumulated reward tokens.
     * @dev Only owner can call and claim the reward tokens residue
     */
    function transferRewardTokenRewards() external onlyOwner {
        updatePool();
        uint256 rewardTokenRewards = rewardToken.balanceOf(address(this));
        TransferHelper.safeTransfer(address(rewardToken), ygnConverter, rewardTokenRewards);
    }

    /**
     * @dev View function to see pending rewards by Nacho XYZ MasterChef Contracts.
     */
    function getStakingRewards() public view returns (uint256 pendingRewards) {
        pendingRewards = masterChefContract.pendingShare(pid, address(this));
    }

    /**
     * @dev View function to get total LP staked in MasterChef Contracts.
     */
    function getTotalLPStaked() public view returns (uint256 totalLPStaked) {
        (totalLPStaked, ) = masterChefContract.userInfo(pid, address(this));
    }

    /**
     * @dev function to claim rewards
     */
    function _claimRewards() internal {
        masterChefContract.deposit(pid, 0);
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
            uint256 rewardTokenRewards = rewardToken.balanceOf(address(this));
            TransferHelper.safeTransfer(address(rewardToken), ygnConverter, rewardTokenRewards);
        }
    }

    /**
     * @notice function to deposit asset to NachoXYZ farms.
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
            TransferHelper.safeTransferFrom(_token, farm, address(this), _amount);
            depositedAmount = _depositAsset(_amount);
        }
        totalInputTokensStaked = totalInputTokensStaked.add(_amount);
    }

    /**
     * @dev function to deposit asset from strategy to NachoXYZ MasterChef Contract.
     */
    function _depositAsset(uint256 _amount) internal returns (uint256 lpReceived) {
        asset.safeApprove(address(masterChefContract), _amount);
        masterChefContract.deposit(pid, _amount);
        lpReceived = _amount;
    }

    /**
     * @notice function to withdraw asset from NachoXYZ farms.
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
        updatePool();
        if (_amount > 0) {
            if (isStrategyEnabled) {
                withdrawnAmount = _withdrawAsset(_amount);
            } else {
                withdrawnAmount = _getWithdrawableAmount(_amount);
            }
            IERC20(_token).safeApprove(address(msg.sender), withdrawnAmount);
        }
        totalInputTokensStaked = totalInputTokensStaked.sub(_amount);
    }

    /**
     * @dev function to withdraw asset from NachoXYZ Stakign Contract to strategy
     */
    function _withdrawAsset(uint256 _lpAmountToWithdraw) internal returns (uint256 assetWithdrawn) {
        masterChefContract.withdraw(pid, _lpAmountToWithdraw);
        assetWithdrawn = _lpAmountToWithdraw;
    }

    /**
     * @dev function to withdraw asset from NachoXYZ Stakign Contract to strategy
     */
    function _emergencyWithdrawAsset() internal {
        masterChefContract.emergencyWithdraw(pid);
    }

    /**
     * @notice function to withdraw all asset and transfer back to liquidity holder.
     * @param _token Address of the token. (Should be the same as the asset token)
     * @dev Can only be called from the liquidity manager by the owner
     */
    function rescueFunds(address _token)
        external
        ensureValidTokenAddress(_token)
        onlyOwner
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
}
