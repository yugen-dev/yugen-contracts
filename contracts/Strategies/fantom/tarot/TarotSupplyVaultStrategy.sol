// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/ISupplyVaultRouter01.sol";
import "interfaces/ISupplyVault.sol";
import "../../../libraries/TransferHelper.sol";

contract TarotSupplyVaultStrategy is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    IERC20 public asset; //asset which is used as underlying for the supply vaults
    IERC20 public vaultToken; //tBTC, tUSDC etc. This is the vault token. Also can be used for tFTM. Asset will be wFTM.
    ISupplyVault public supplyVault; //Supply Vault contract (also tBTC etc.)
    ISupplyVaultRouter01 public supplyVaultRouter; //Router to be used for depositing and withdrawing in Tarot Supply vaults.
    address public ygnConverter; // YGN Converter address
    address public farm; //Farm Address

    uint256 public strategyWithdrawalFeeBP = 0;
    uint256 public strategyDepositFeeBP = 0;
    uint256 public totalInputTokensStaked = 0;
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
     * @notice Creates a new TarotERC20SupplyVault Strategy Contract
     * @param _asset same which is used as underlying in supplyVault
     * @param _supplyVault supply vault contract in Tarot Eco-system
     * @param _supplyVaultRouter supply vault router contract in Tarot Eco-system
     * @param _ygnConverter fee address for transferring residues and reward tokens
     * @param _farm Farm Address that deposits and withdraws into this strategy
     * @dev deployer of contract is set as owner
     */
    constructor(
        IERC20 _asset,
        ISupplyVault _supplyVault,
        ISupplyVaultRouter01 _supplyVaultRouter,
        address _ygnConverter,
        address _farm
    ) {
        asset = _asset;
        supplyVault = _supplyVault;
        supplyVaultRouter = _supplyVaultRouter;
        vaultToken = IERC20(address(_supplyVault));
        ygnConverter = _ygnConverter;
        farm = _farm;
        liquidityHolders[_farm] = true;
    }

    /**
     * @notice Updates the Liquidity Holders for the strategy
     * @param _liquidityHolder address of the liquidity holder
     * @param _status bool flag to enable disable liquidity holder
     * @dev Only owner can call and update the liquditiy holder status
     */
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
     * @notice Updates the Supply Vault Router used by Tarot
     * @param _supplyVaultRouter Address of the Supply Vault Router Contract
     * @dev Only owner can call and update the Supply Vault Router address. Should be updated if the Tarot team updates it. (add to todos)
     */
    function updateSupplyVaultRouterContract(ISupplyVaultRouter01 _supplyVaultRouter)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_supplyVaultRouter))
    {
        supplyVaultRouter = _supplyVaultRouter;
    }

    /**
     * @notice Updates the Supply Vault used by Tarot
     * @param _supplyVault Address of the Supply Vault Contract
     * @dev Only owner can call and update the Supply Vault address. This need to use this shouldn't be there unless any specific problem on tarot side.
     */
    function updateSupplyVaultContract(ISupplyVault _supplyVault)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_supplyVault))
    {
        supplyVault = _supplyVault;
        vaultToken = IERC20(address(_supplyVault));
    }

    /**
     * @notice Updates the asset Address.
     * @param _asset Address of the asset
     * @dev Only owner can call and update the asset address. This should be rarely used and should be similar to the underlying token used in SupplyVault
     */
    function updateAsset(IERC20 _asset)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_asset))
    {
        asset = _asset;
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
     * @notice transfer accumulated tTokens. Shouldn't be called since this will transfer community's tTokens residue to ygnConverter
     * @dev Only owner can call and claim the tTokens residue
     */
    function transferVaultTokenResidue() external onlyOwner nonReentrant {
        updatePool();
        uint256 vaultTokenResidue = vaultToken.balanceOf(address(this));
        if (vaultTokenResidue > 0) {
            TransferHelper.safeTransfer(address(vaultToken), ygnConverter, vaultTokenResidue);
        }
    }

    /**
     * @dev View function to get total vault tokens in Supply Vault Contracts.
     */
    function getTotalVaultTokensInStrategy()
        public
        view
        returns (uint256 totalVaultTokensInStrategy)
    {
        totalVaultTokensInStrategy = vaultToken.balanceOf(address(this));
    }

    /**
     * @dev function to get latest total underlying balance in Supply Vaults (deposited plus rewards).
     */
    function getTotalUnderlyingBalance() public returns (uint256 totalUnderlyingBalance) {
        if (totalInputTokensStaked > 0) {
            totalUnderlyingBalance = supplyVault.underlyingBalanceForAccount(address(this));
        }
    }

    /**
     * @dev function to get share value (number of tokens) for the respective underlying amount
     */
    function getUnderlyingValuedAsShare(uint256 _underlyingAmount) public returns (uint256 share) {
        if (_underlyingAmount > 0) {
            share = supplyVault.underlyingValuedAsShare(_underlyingAmount);
        }
    }

    /**
     * @dev View function to process supply vault rewards.
     */
    function _processSupplyVaultRewards() internal returns (uint256 earnedRewards) {
        uint256 totalUnderlyingBalance = getTotalUnderlyingBalance();
        if (totalUnderlyingBalance > totalInputTokensStaked) {
            uint256 underlyingAmountToWithdraw = totalUnderlyingBalance.sub(totalInputTokensStaked);
            //make sure to log this and see if correct and greater than zero
            uint256 rewardSharesToWithdraw = getUnderlyingValuedAsShare(underlyingAmountToWithdraw);
            earnedRewards = _withdrawAsset(rewardSharesToWithdraw);
        }
    }

    /**
     * @notice External function to see pending underlying rewards on frontend.
     */
    function getPendingRewards() external nonReentrant returns (uint256 pendingRewards) {
        uint256 totalUnderlyingBalance = getTotalUnderlyingBalance();
        pendingRewards = totalUnderlyingBalance.sub(totalInputTokensStaked);
    }

    /**
     * @notice Update reward variables of the pool to be up-to-date. This also claims the rewards generated from the supply vaults
     */
    function updatePool() public {
        if (totalInputTokensStaked == 0) {
            return;
        }

        uint256 earnedRewards = _processSupplyVaultRewards();
        if (earnedRewards > 0) {
            //send rewards to converter
            TransferHelper.safeTransfer(address(asset), ygnConverter, earnedRewards);
        } else {
            // when no rewards are present
            return;
        }
    }

    /**
     * @notice function to deposit asset to Tarot Supply Vaults.
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
     * @dev function to deposit asset from strategy to Tarot Supply Vaults Contract.
     */
    function _depositAsset(uint256 _amount) internal returns (uint256 depositedAmount) {
        TransferHelper.safeApprove(address(asset), address(supplyVaultRouter), _amount);
        supplyVaultRouter.enterWithAlloc(supplyVault, _amount); //this returns total tTokens received if we need to do anything with it
        depositedAmount = _amount;
    }

    /**
     * @notice function to withdraw asset from Tarot Supply Vaults.
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
                uint256 rewardSharesToWithdraw = getUnderlyingValuedAsShare(_amount);

                //check here if it only withdraws that specific amount and no rewards
                withdrawnAmount = _withdrawAsset(rewardSharesToWithdraw);
            } else {
                withdrawnAmount = _getWithdrawableAmount(_amount);
            }
            TransferHelper.safeApprove(address(asset), address(msg.sender), withdrawnAmount);
        }
        totalInputTokensStaked = totalInputTokensStaked.sub(_amount);
    }

    /**
     * @dev function to withdraw asset from Tarot Supply Vaults Contract to strategy
     */
    function _withdrawAsset(uint256 _sharesToWithdraw) internal returns (uint256 withdrawnAmount) {
        if (_sharesToWithdraw > 0) {
            TransferHelper.safeApprove(
                address(vaultToken),
                address(supplyVaultRouter),
                _sharesToWithdraw
            );
            withdrawnAmount = supplyVaultRouter.leave(supplyVault, _sharesToWithdraw);
        }
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
        uint256 totalVaultTokensInStrategy = getTotalVaultTokensInStrategy();

        if (totalVaultTokensInStrategy > 0) {
            _withdrawAsset(totalVaultTokensInStrategy);
            rescuedAssetAmount = asset.balanceOf(address(this));
            emit RescueAsset(msg.sender, rescuedAssetAmount);
            isStrategyEnabled = false;
        }
    }

    /**
     * @dev function to calculate withdrawable amount when strategy is disabled
     */
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
