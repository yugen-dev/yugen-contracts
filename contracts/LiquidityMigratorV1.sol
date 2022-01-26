// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IRewardManager.sol";
import "interfaces/IFarm.sol";
import "interfaces/IFYGN.sol";
import "./libraries/TransferHelper.sol";

contract LiquidityMigratorV1 is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using Address for address;
    using SafeERC20 for IERC20;

    IFarm public immutable farm;

    IRewardManager public immutable rewardManager;

    IFYGN public immutable fYGN; // The fYGN TOKEN!

    event LiquidityMigrated(uint256 oldPid, uint256 newPid, uint256 amount, IERC20 token);

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    constructor(
        IFarm _farm,
        IRewardManager _rewardManger,
        IFYGN _fYGN
    ) {
        farm = _farm;
        rewardManager = _rewardManger;
        fYGN = _fYGN;
    }

    // need to call addUserToWhiteList before this
    //Prerequisite: in RewardManager excludedAddresses[LiquidityMigrator_Contract] & rewardDistributor[LiquidityMigrator_Contract] should be set to true
    function switchLiquidity(
        uint256 _oldPid,
        IERC20 _token,
        uint256 _amount,
        bool _userWantsToStake,
        uint256 _newPid
    ) external nonReentrant ensureNonZeroAddress(address(_token)) {
        require(_oldPid < farm.poolLength() && _newPid < farm.poolLength(), "Pool does not exist");
        require(_amount > 0, "Migrator called with invalid amount");

        //Withdraw old LP tokens from farm.
        //User wants to stake is false since it doesn't matter as all rewards come back to migrator as its excluded by the reward managers.
        uint256 beforeWithdrawTokenBalance = _token.balanceOf(address(this));
        farm.withdrawFor(_oldPid, _amount, msg.sender, false);

        //Can't check with full amount at two points (before calling depositFor as well) since some pools could have withdraw fees.
        uint256 afterWithdrawTokenBalance = _token.balanceOf(address(this));
        require(afterWithdrawTokenBalance > 0, "No Lp tokens received in migrator");
        uint256 newDepositAmount = afterWithdrawTokenBalance.sub(beforeWithdrawTokenBalance);
        require(
            newDepositAmount <= _amount && newDepositAmount > 0,
            "Insufficient Lp tokens received in migrator"
        );

        //Migrator vests users's fYGN to reward manager for the user
        uint256 fYGNBalance = fYGN.balanceOf(address(this));
        if (fYGNBalance > 0) {
            TransferHelper.safeTransfer(address(fYGN), address(rewardManager), fYGNBalance);
            rewardManager.handleRewardsForUser(msg.sender, fYGNBalance, _userWantsToStake);
        }

        //Deposit token in new farm pool which has the same token as the inputToken.
        TransferHelper.safeApprove(address(_token), address(farm), newDepositAmount);
        farm.depositFor(_newPid, newDepositAmount, msg.sender, _userWantsToStake);

        emit LiquidityMigrated(_oldPid, _newPid, newDepositAmount, _token);
    }

    // Rescue any tokens that have not been able to processed by the contract
    function rescueFunds(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        TransferHelper.safeTransfer(address(_token), owner(), balance);
    }
}
