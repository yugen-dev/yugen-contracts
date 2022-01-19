// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IRegistry.sol";
import "interfaces/IWallet.sol";
import "interfaces/IDistribution.sol";
import "interfaces/IVault.sol";
import "interfaces/IMemory.sol";
import "../libraries/TransferHelper.sol";

contract EthalendVaultsQuickSwapStrategy is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    // Contracts used by Ethalend.
    struct EthalendContracts {
        IRegistry registry; //ethalend registry contract
        address curvePool; // curvePool conntract address
        address transferLogic; //contract address used by ethalend underneath to transfer funds to ethalend before deposit.
        address curveLogic; //contract address used by ethalend underneath to swap/addLiquidity for curve pools.
        address quickSwapLogic; //contract address used by ethalend underneath to swap/addLiquidity to quickswap.
        address vaultLogic; //contract address used by ethalend underneath to deposit funds into vaults
        address eVault; //contract address used by ethalend. This is the vault address so if the reward token is weth, this will be weth Evault address
    }

    EthalendContracts public ethalendContracts;

    IWallet public ethaWallet;
    IMemory public memoryContract; //This is the memory contract address used to retrieve variables stored in memory

    IERC20 public asset; //same which was used in staking pool
    IERC20 public secondaryAsset; //the token used as tokenB when providing liquidity.
    IERC20 public rewardToken; //wmatic/wbtc/link
    IERC20 public etha;

    address public ygnConverter; // YGN Converter address
    address public farm; //Farm Address
    uint256 public strategyWithdrawalFeeBP = 10; // 0.1% in ethalend. StrategyWithdraw fee in basis points. This is respective to ethalend and the token so there is no use of saving this in poolInfo
    uint256 public strategyDepositFeeBP = 0;
    uint256 public totalInputTokensStaked = 0;

    bool public supportsEmergencyWithdraw = false;
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
     * @notice Creates a new Ethalend Vault Strategy Contract
     * @param _asset usdc/usdt/dai token address. This is the input token for the pool and the vault.
     * @param _secondaryAsset This is the secondary asset which is introduced as a pair with the vaults.
     * @param _rewardToken Reward Token is the reward given out by the vaults (wbtc, wmatic, link)
     * @param _etha Etha Token Address
     * @param _registry; //ethalend registry contract
     * @param _curvePool; //curve pool contract used for swapping by curve
     * @param _transferLogic; //contract address used by ethalend underneath to transfer funds to ethalend.
     * @param _curveLogic; //contract address used by ethalend underneath to swap for curve pools.
     * @param _quickSwapLogic; //contract address used by ethalend underneath to swap/addLiquidity to quickswap.
     * @param _vaultLogic; //contract address used by ethalend underneath to deposit/withdraw funds for vaults
     * @param _eVault; //contract address used by ethalend which is the vault address so if the reward token is weth, this will be weth Evault address
     * @param _ygnConverter fee address for transferring residues and reward tokens
     * @dev deployer of contract is set as owner
     */
    constructor(
        IERC20 _asset,
        IERC20 _secondaryAsset,
        IERC20 _rewardToken,
        IERC20 _etha,
        IRegistry _registry,
        address _curvePool,
        address _transferLogic,
        address _curveLogic,
        address _quickSwapLogic,
        address _vaultLogic,
        address _eVault,
        address _ygnConverter
    ) {
        asset = _asset;
        secondaryAsset = _secondaryAsset;
        rewardToken = _rewardToken;
        etha = _etha;
        ethalendContracts.registry = _registry;
        ethalendContracts.curvePool = _curvePool;
        ethalendContracts.transferLogic = _transferLogic;
        ethalendContracts.curveLogic = _curveLogic;
        ethalendContracts.quickSwapLogic = _quickSwapLogic;
        ethalendContracts.vaultLogic = _vaultLogic;
        ethalendContracts.eVault = _eVault;
        ygnConverter = _ygnConverter;
        ethaWallet = IWallet(ethalendContracts.registry.deployWallet());
        require(address(ethaWallet) != address(0), "Etha Wallet not deployed");
        IERC20(asset).safeApprove(address(ethaWallet), uint256(-1));
        memoryContract = IMemory(ethalendContracts.registry.memoryAddr());
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
     * @notice Updates the QuickSwap LP Token Address.
     * @param _asset Address of the QuickSwap LP
     * @dev Only owner can call and update the QuickSwap LP address
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
     * @notice Can be used by the owner to update the address for etha token
     * @param _etha ERC20 address for the etha token
     * @dev Only owner can call and update the etha token address.
     */
    function updateETHA(IERC20 _etha) external onlyOwner ensureNonZeroAddress(address(_etha)) {
        etha = _etha;
    }

    /**
     * @notice Updates the secondary asset of the strategy. Should not be used since the funds will remain in the first vault
     * @param _secondaryAsset Address of the secondary asset
     * @dev Only owner can call and update the secondary asset
     */
    function updateSecondaryAsset(IERC20 _secondaryAsset)
        external
        onlyOwner
        ensureNonZeroAddress(address(_secondaryAsset))
    {
        secondaryAsset = _secondaryAsset;
    }

    /**
     * @notice Updates the registry contract of the ethalend ecosystem.
     * @param _registry Address of the registry
     * @dev Only owner can call and update the registry contract of the ethalend registry
     */
    function updateRegistry(IRegistry _registry)
        external
        onlyOwner
        ensureNonZeroAddress(address(_registry))
    {
        ethalendContracts.registry = _registry;
    }

    /**
     * @notice Updates the transferLogic contract of the ethalend ecosystem.
     * @param _transferLogic Address of the transferLogic contract
     * @dev Only owner can call and update the transferLogic contract of the ethalend ecosystem
     */
    function updateTransferLogicContract(address _transferLogic)
        external
        onlyOwner
        ensureNonZeroAddress(_transferLogic)
    {
        ethalendContracts.transferLogic = _transferLogic;
    }

    /**
     * @notice Updates the curveLogic contract of the ethalend ecosystem.
     * @param _curveLogic Address of the curveLogic contract
     * @dev Only owner can call and update the curveLogic contract of the ethalend ecosystem
     */
    function updateCurveLogicContract(address _curveLogic)
        external
        onlyOwner
        ensureNonZeroAddress(_curveLogic)
    {
        ethalendContracts.curveLogic = _curveLogic;
    }

    /**
     * @notice Updates the curvePool contract of the ethalend ecosystem.
     * @param _curvePool Address of the curvePool contract
     * @dev Only owner can call and update the curvePool contract of the ethalend ecosystem
     */
    function updateCurvePoolContract(address _curvePool)
        external
        onlyOwner
        ensureNonZeroAddress(_curvePool)
    {
        ethalendContracts.curvePool = _curvePool;
    }

    /**
     * @notice Updates the quickSwapLogic contract of the ethalend ecosystem.
     * @param _quickSwapLogic Address of the quickSwapLogic contract
     * @dev Only owner can call and update the quickSwapLogic contract of the ethalend ecosystem
     */
    function updateEthalendQuickSwapLogicContract(address _quickSwapLogic)
        external
        onlyOwner
        ensureNonZeroAddress(_quickSwapLogic)
    {
        ethalendContracts.quickSwapLogic = _quickSwapLogic;
    }

    /**
     * @notice Updates the vaultLogic contract of the ethalend ecosystem.
     * @param _vaultLogic Address of the vaultLogic contract
     * @dev Only owner can call and update the vaultLogic contract of the ethalend ecosystem
     */
    function updateEthalendVaultLogicContract(address _vaultLogic)
        external
        onlyOwner
        ensureNonZeroAddress(_vaultLogic)
    {
        ethalendContracts.vaultLogic = _vaultLogic;
    }

    /**
     * @notice Updates the eVault contract of the ethalend ecosystem. This is the exact vault dependent on the rewardToken given out.
     * @param _eVault Address of the eVault contract
     * @dev Only owner can call and update the eVault contract of the ethalend ecosystem
     */
    function updateEthalendEVaultContract(address _eVault)
        external
        onlyOwner
        ensureNonZeroAddress(_eVault)
    {
        ethalendContracts.eVault = _eVault;
    }

    /**
     * @notice Can be used by the owner to update the withdrawal fee based on the ethalend contracts. Should not be modified unless ethalend updates it.
     * @param _strategyWithdrawalFeeBP New withdrawal fee of the ethalend vault contracts in basis points
     * @dev Only owner can call and update the ethalend withdrawal fee.
     */
    function updateStrategyWithdrawalFee(uint256 _strategyWithdrawalFeeBP) external onlyOwner {
        strategyWithdrawalFeeBP = _strategyWithdrawalFeeBP;
    }

    /**
     * @notice Can be used by the owner to update the deposit fee based on the ethalend contracts. Currently there is no deposit fee
     * @param _strategyDepositFeeBP New deposit fee of the ethalend vault contracts in basis points
     * @dev Only owner can call and update the ethalend deposit fee.
     */
    function updateStrategyDepositFee(uint256 _strategyDepositFeeBP) external onlyOwner {
        strategyDepositFeeBP = _strategyDepositFeeBP;
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
     * @param _withdrawFromEthaWallet true if rewards need to be withdrawn from ethawallet.
     * @dev Only owner can call and claim the residue assets
     */
    function transferAssetResidue(bool _withdrawFromEthaWallet) external onlyOwner {
        updatePool();
        if (_withdrawFromEthaWallet) {
            _withdrawTokenFromEthaWallet(address(asset), asset.balanceOf(address(ethaWallet)));
        }
        uint256 assetResidue = asset.balanceOf(address(this));
        TransferHelper.safeTransfer(address(asset), ygnConverter, assetResidue);
    }

    /**
     * @notice transfer accumulated secodary asset. Shouldn't be called since this will transfer community's residue secondary asset to ygnConverter
     * @param _withdrawFromEthaWallet true if rewards need to be withdrawn from ethawallet.
     * @dev Only owner can call and claim the secondary assets residue
     */
    function transferSecondaryAssetResidue(bool _withdrawFromEthaWallet) external onlyOwner {
        updatePool();
        if (_withdrawFromEthaWallet) {
            _withdrawTokenFromEthaWallet(
                address(secondaryAsset),
                secondaryAsset.balanceOf(address(ethaWallet))
            );
        }
        uint256 secondaryAssetResidue = secondaryAsset.balanceOf(address(this));
        TransferHelper.safeTransfer(address(secondaryAsset), ygnConverter, secondaryAssetResidue);
    }

    /**
     * @notice transfer accumulated reward tokens. Shouldn't be called since this will transfer community's reward tokens to ygnConverter
     * @dev Only owner can call and claim the reward tokens
     */
    function transferRewardTokenRewards(bool _withdrawFromEthaWallet) external onlyOwner {
        updatePool();
        if (_withdrawFromEthaWallet) {
            _withdrawTokenFromEthaWallet(
                address(rewardToken),
                rewardToken.balanceOf(address(ethaWallet))
            );
        }
        uint256 rewardTokenRewards = rewardToken.balanceOf(address(this));
        TransferHelper.safeTransfer(address(rewardToken), ygnConverter, rewardTokenRewards);
    }

    /**
     * @notice transfer etha rewards tokens. Shouldn't be called since this will transfer community's etha to ygnConverter.
     * @dev Only owner can call and claim the etha reward tokens
     */
    function transferEthaRewards(bool _withdrawFromEthaWallet) external onlyOwner {
        updatePool();
        if (_withdrawFromEthaWallet) {
            _withdrawTokenFromEthaWallet(address(etha), etha.balanceOf(address(ethaWallet)));
        }
        uint256 ethaTokenRewards = etha.balanceOf(address(this));
        TransferHelper.safeTransfer(address(etha), ygnConverter, ethaTokenRewards);
    }

    /**
     * @dev View function to see pending etha rewards.
     */
    function getPendingEthaRewards() public view returns (uint256 pendingEthaRewards) {
        IDistribution distribution = IDistribution(IVault(ethalendContracts.eVault).distribution());
        pendingEthaRewards = distribution.earned(address(ethaWallet));
    }

    /**
     * @dev View function to see pending reward tokens generated.
     */
    function getTotalRewardTokensGenerated()
        public
        view
        returns (uint256 totalRewardTokensGenerated)
    {
        totalRewardTokensGenerated = IVault(ethalendContracts.eVault).unclaimedProfit(
            address(ethaWallet)
        );
    }

    /**
     * @dev View function to get total LP staked in vaults.
     */
    function getTotalLPStaked() public view returns (uint256 totalLPStaked) {
        IVault vault = IVault(ethalendContracts.eVault);
        totalLPStaked = vault.balanceOf(address(ethaWallet));
    }

    /**
     * @dev function to claim rewards (etha and rewardTokens to ethawallet)
     */
    function _claimRewardsToEthaWallet() internal {
        //These steps are for building the claim tx.
        address[] memory targets = new address[](1);
        bytes[] memory datas = new bytes[](1);

        targets[0] = ethalendContracts.vaultLogic;
        datas[0] = abi.encodeWithSignature(
            "claim(address,uint256)",
            address(ethalendContracts.eVault),
            0 //setId. Is zero since it doesn't matter
        );

        ethaWallet.execute(targets, datas);
    }

    // function to withdraw rewards (rewardTokens and etha tokens) from ethaWallet to contract.
    function _withdrawRewardsFromEthaWallet() internal {
        //withdraw full available balance of the reward tokens
        _withdrawTokenFromEthaWallet(
            address(rewardToken),
            rewardToken.balanceOf(address(ethaWallet))
        );
        //withdraw full available balance of the etha tokens
        _withdrawTokenFromEthaWallet(address(etha), etha.balanceOf(address(ethaWallet)));
    }

    /**
     * @dev function to withdraw token from ethaWallet to strategy contract.
     */
    function _withdrawTokenFromEthaWallet(address _token, uint256 _amountToWithdraw)
        internal
        returns (uint256 withdrawnAmount)
    {
        if (_amountToWithdraw > 0) {
            uint256 initialStrategyBalance = IERC20(_token).balanceOf(address(this));
            address[] memory targets = new address[](1);
            bytes[] memory datas = new bytes[](1);
            targets[0] = ethalendContracts.transferLogic;
            datas[0] = abi.encodeWithSignature(
                "withdraw(address,uint256)",
                _token,
                _amountToWithdraw
            );
            ethaWallet.execute(targets, datas);
            uint256 afterWithdrawStrategyBalance = IERC20(_token).balanceOf(address(this));
            withdrawnAmount = afterWithdrawStrategyBalance.sub(initialStrategyBalance);
            require(withdrawnAmount == _amountToWithdraw, "Invalid withdrawn amount processed");
        }
    }

    // function to deposit asset from contract to Ethalend Vaults.
    function _depositAssetToEthalendVaults(uint256 _amount) internal {
        uint256 initialLPBalanceInVaults = getTotalLPStaked();
        //These steps are for building the lego tx.
        address[] memory targets = new address[](4);
        bytes[] memory datas = new bytes[](4);

        //Step 1 - Transfer asset from strategy to created ethalend wallet.
        targets[0] = ethalendContracts.transferLogic;
        datas[0] = abi.encodeWithSignature("deposit(address,uint256)", asset, _amount);

        //Step 2- Swap half of asset to secondary asset using curveLogic contract
        targets[1] = ethalendContracts.curveLogic;
        datas[1] = abi.encodeWithSignature(
            "swap(address,address,address,uint256,uint256,uint256,uint256)",
            ethalendContracts.curvePool,
            asset,
            secondaryAsset,
            _amount.div(2),
            0, //getId
            1, //setId (for setting in memory where amount of B tokens are stored)
            1 //divider which is 1 by default
        );

        //Step 3 - Add Liquidity for asset and secondary asset using quickSwapLogic contract
        targets[2] = ethalendContracts.quickSwapLogic;
        datas[2] = abi.encodeWithSignature(
            "addLiquidity(address,address,uint256,uint256,uint256,uint256,uint256,uint256)",
            address(asset),
            address(secondaryAsset),
            _amount.div(2),
            0, //since this is fetched from the memory i.e. getId2
            0, //getId is 0, since amt tokenA is provided
            1, //getId2 is 1 since the amount swapped is stored at id - 1 in memory contract
            1, //setId is 1 since this is for the no.of lp tokens that are received and stored in memory
            1 //divider which is 1 by default
        );

        //Step 4 - Add Received LP Tokens in the respective e-vault contract through the vault logic contract
        targets[3] = ethalendContracts.vaultLogic;
        datas[3] = abi.encodeWithSignature(
            "deposit(address,uint256,uint256)",
            address(ethalendContracts.eVault),
            0, //can add this as anything since this is fetched from the memory
            1 //getId2 this is memory id for where the lp tokens are stored
        );

        ethaWallet.execute(targets, datas);
        uint256 finalLPBalanceInVaults = getTotalLPStaked();
        uint256 lpDeposited = memoryContract.getUint(1); //since this is for the no.of lp tokens that are received
        require(
            lpDeposited == finalLPBalanceInVaults.sub(initialLPBalanceInVaults),
            "Invalid LP amount deposited"
        );
    }

    // function to withdraw asset from Ethalend Vaults to ethawallet.
    function _withdrawAssetFromEthalendVaults(uint256 _lpAmountToWithdraw)
        internal
        returns (uint256 assetWithdrawnInEthaWallet)
    {
        uint256 initialAssetBalanceInEthaWallet = asset.balanceOf(address(ethaWallet));
        //These steps are for building the lego tx.
        address[] memory targets = new address[](3);
        bytes[] memory datas = new bytes[](3);

        //Step 1 - Remove LP tokens based on the number of tokens deposited.
        targets[0] = ethalendContracts.vaultLogic;
        datas[0] = abi.encodeWithSignature(
            "withdraw(address,uint256,uint256,uint256)",
            address(ethalendContracts.eVault),
            _lpAmountToWithdraw,
            0, //getId
            1 //setId (for setting in memory where amount of LP tokens removed are stored)
        );

        //Step 2- Remove Liquidity for these LP tokens

        targets[1] = ethalendContracts.quickSwapLogic;
        datas[1] = abi.encodeWithSignature(
            "removeLiquidity(address,address,address,uint256,uint256,uint256,uint256,uint256)",
            address(asset),
            address(secondaryAsset),
            address(IVault(ethalendContracts.eVault).underlying()),
            0, //amount of LP. Here zero since it will take from memory
            1, //getId for where LP tokens are stored
            1, //setId (for setting in memory where amount of asset tokens are stored)
            2, //setId2 (for setting in memory where amount of secondary asset tokens are stored)
            1 //divider which is 1 by default
        );

        //Step 3 - Swap secondary asset received to primary asset. This step is trickey. Need to know if we need to use quickswap to remove liquidity or curve.
        targets[2] = ethalendContracts.curveLogic;
        datas[2] = abi.encodeWithSignature(
            "swap(address,address,address,uint256,uint256,uint256,uint256)",
            ethalendContracts.curvePool,
            address(secondaryAsset),
            address(asset),
            0, //amount of source token. Here zero since it will take from memory
            2, //getId is 2 since the amount of tokenB is stored at 12 in memory contract
            3, //setId is 3. This is for the amount of asset received after swapping.
            1 //divider which is 1 by default
        );

        ethaWallet.execute(targets, datas);

        uint256 finalAssetBalanceInEthaWallet = asset.balanceOf(address(ethaWallet));
        assetWithdrawnInEthaWallet = memoryContract.getUint(1).add(memoryContract.getUint(3)); //swapped amout plus the amount received by removing liquidity

        //consider again if this is needed
        require(
            assetWithdrawnInEthaWallet ==
                finalAssetBalanceInEthaWallet.sub(initialAssetBalanceInEthaWallet),
            "Invalid amount of asset withdrawn"
        );
    }

    /**
     * @notice View function to see pending rewards on frontend.
     */
    function getPendingRewards()
        external
        view
        returns (uint256 pendingRewardTokens, uint256 pendingEthaTokens)
    {
        pendingRewardTokens = getTotalRewardTokensGenerated();
        pendingEthaTokens = getPendingEthaRewards();
    }

    /**
     * @notice Update reward variables of the pool to be up-to-date. This also claims the rewards generated form vaults
     */
    function updatePool() public {
        uint256 totalLPStaked = getTotalLPStaked();

        if (totalLPStaked == 0) {
            return;
        }

        uint256 totalRewardTokensGenerated = getTotalRewardTokensGenerated();
        uint256 pendingEthaRewards = getPendingEthaRewards();

        if (totalRewardTokensGenerated > 0 || pendingEthaRewards > 0) {
            _claimRewardsToEthaWallet();
            _withdrawRewardsFromEthaWallet();
            uint256 rewardTokenRewards = rewardToken.balanceOf(address(this));
            TransferHelper.safeTransfer(address(rewardToken), ygnConverter, rewardTokenRewards);
            uint256 ethaTokenRewards = etha.balanceOf(address(this));
            TransferHelper.safeTransfer(address(etha), ygnConverter, ethaTokenRewards);
        }
    }

    /**
     * @notice function to deposit asset to ethalend vaults.
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
            _depositAssetToEthalendVaults(_amount);
            depositedAmount = _amount;
        }
        totalInputTokensStaked = totalInputTokensStaked.add(_amount);
    }

    /**
     * @notice function to withdraw asset from ethalend vaults.
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
                uint256 totalLPStaked = getTotalLPStaked();
                uint256 lpAmountToWithdraw = _amount.mul(totalLPStaked).div(totalInputTokensStaked);
                uint256 assetWithdrawnInEthaWallet = _withdrawAssetFromEthalendVaults(
                    lpAmountToWithdraw
                );
                withdrawnAmount = _withdrawTokenFromEthaWallet(
                    address(asset),
                    assetWithdrawnInEthaWallet
                );
            } else {
                withdrawnAmount = _getWithdrawableAmount(_amount);
            }
            IERC20(_token).safeApprove(address(msg.sender), withdrawnAmount);
        }
        totalInputTokensStaked = totalInputTokensStaked.sub(_amount);
    }

    /**
     * @notice function to withdraw all asset and transfer back to liquidity holder.
     * @param _token Address of the token. (Should be the same as the asset token)
     * @dev Can only be called from the liquidity manager by the owner
     */
    function rescueFunds(address _token)
        external
        onlyOwner
        ensureValidTokenAddress(_token)
        returns (uint256 rescuedAssetAmount)
    {
        updatePool();
        uint256 totalLPStaked = getTotalLPStaked();

        if (totalLPStaked > 0) {
            _withdrawAssetFromEthalendVaults(totalLPStaked);
            _withdrawTokenFromEthaWallet(address(asset), asset.balanceOf(address(ethaWallet)));
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
