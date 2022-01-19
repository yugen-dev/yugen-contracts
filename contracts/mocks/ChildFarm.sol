// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// MasterChef is the master of PolyZap Token (PZAP). He can make PZAP and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. Initially the ownership is
// transferred to TimeLock contract and Later the ownership will be transferred to a governance smart
// contract once $PZAP is sufficiently distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterChef is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 rewardLockedUp; // Reward locked up.
        uint256 nextHarvestUntil; // When can the user harvest again.
        //
        // We do some fancy math here. Basically, any point in time, the amount of PZAPs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accPZapPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accPZapPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. PZAPs to distribute per block.
        uint256 lastRewardBlock; // Last block number that PZAPs distribution occurs.
        uint256 accPZapPerShare; // Accumulated PZAPs per share, times 1e12. See below.
        uint16 depositFeeBP; // Deposit fee in basis points
        uint256 harvestInterval; // Harvest interval in seconds
    }

    // The PolyZap Token!
    IERC20 public pZap;
    // Dev address.
    address public devAddr;
    // Deposit Fee address
    address public feeAddress;
    // PZAP tokens created per block.
    uint256 public pZapPerBlock;
    // Max harvest interval: 14 days.
    uint256 public constant MAXIMUM_HARVEST_INTERVAL = 14 days;
    // Total locked up rewards
    uint256 public totalLockedUpRewards;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when PZAP mining starts.
    uint256 public startBlock;
    // Referral Bonus in basis points. Initially set to 2%
    uint256 public refBonusBP = 200;
    // Max deposit fee: 10%.
    uint16 public constant MAXIMUM_DEPOSIT_FEE_BP = 1000;
    // Max referral commission rate: 20%.
    uint16 public constant MAXIMUM_REFERRAL_BP = 2000;
    // Referral Mapping
    mapping(address => address) public referrers; // account_address -> referrer_address
    mapping(address => uint256) public referredCount; // referrer_address -> num_of_referred
    // Pool Exists Mapper
    mapping(IERC20 => bool) public poolExistence;
    // Pool ID Tracker Mapper
    mapping(IERC20 => uint256) public poolIdForLpAddress;

    // Initial emission rate: 1 PZAP per block.
    uint256 public constant INITIAL_EMISSION_RATE = 1 ether;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event SetFeeAddress(address indexed user, address indexed _devAddress);
    event SetDevAddress(address indexed user, address indexed _feeAddress);
    event Referral(address indexed _referrer, address indexed _user);
    event ReferralPaid(address indexed _user, address indexed _userTo, uint256 _reward);
    event ReferralBonusBpChanged(uint256 _oldBp, uint256 _newBp);
    event UpdateEmissionRate(address indexed user, uint256 indexed _pZapPerBlock);
    event RewardLockedUp(address indexed user, uint256 indexed pid, uint256 amountLockedUp);

    constructor(
        IERC20 _pZap,
        address _devAddr,
        address _feeAddress,
        uint256 _startBlock
    ) public {
        pZap = _pZap;
        devAddr = _devAddr;
        feeAddress = _feeAddress;
        pZapPerBlock = INITIAL_EMISSION_RATE;
        startBlock = _startBlock;
    }

    // Get number of pools added.
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function getPoolIdForLpToken(IERC20 _lpToken) external view returns (uint256) {
        require(poolExistence[_lpToken] != false, "getPoolIdForLpToken: do not exist");
        return poolIdForLpAddress[_lpToken];
    }

    // Modifier to check Duplicate pools
    modifier nonDuplicated(IERC20 _lpToken) {
        require(poolExistence[_lpToken] == false, "nonDuplicated: duplicated");
        _;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
        uint16 _depositFeeBP,
        uint256 _harvestInterval,
        bool _withUpdate
    ) public onlyOwner nonDuplicated(_lpToken) {
        require(_depositFeeBP <= MAXIMUM_DEPOSIT_FEE_BP, "add: invalid deposit fee basis points");
        require(_harvestInterval <= MAXIMUM_HARVEST_INTERVAL, "add: invalid harvest interval");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolExistence[_lpToken] = true;
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accPZapPerShare: 0,
                depositFeeBP: _depositFeeBP,
                harvestInterval: _harvestInterval
            })
        );
        poolIdForLpAddress[_lpToken] = poolInfo.length - 1;
    }

    // Update the given pool's PZAP allocation point and deposit fee. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        uint16 _depositFeeBP,
        uint256 _harvestInterval,
        bool _withUpdate
    ) public onlyOwner {
        require(_depositFeeBP <= MAXIMUM_DEPOSIT_FEE_BP, "set: invalid deposit fee basis points");
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].depositFeeBP = _depositFeeBP;
        poolInfo[_pid].harvestInterval = _harvestInterval;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from);
    }

    // View function to see pending PZAPs on frontend.
    function pendingPZap(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accPZapPerShare = pool.accPZapPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 pZapReward = multiplier.mul(pZapPerBlock).mul(pool.allocPoint).div(
                totalAllocPoint
            );
            accPZapPerShare = accPZapPerShare.add(pZapReward.mul(1e12).div(lpSupply));
        }
        uint256 pending = user.amount.mul(accPZapPerShare).div(1e12).sub(user.rewardDebt);
        return pending.add(user.rewardLockedUp);
    }

    // View function to see if user can harvest PZAP's.
    function canHarvest(uint256 _pid, address _user) public view returns (bool) {
        UserInfo storage user = userInfo[_pid][_user];
        return block.timestamp >= user.nextHarvestUntil;
    }

    // View function to see if user harvest until time.
    function getHarvestUntil(uint256 _pid, address _user) public view returns (uint256) {
        UserInfo storage user = userInfo[_pid][_user];
        return user.nextHarvestUntil;
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0 || pool.allocPoint == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 pZapReward = multiplier.mul(pZapPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        pool.accPZapPerShare = pool.accPZapPerShare.add(pZapReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterChef for PZAP allocation.
    function deposit(uint256 _pid, uint256 _amount) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        payOrLockupPendingPZap(_pid);
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            if (pool.depositFeeBP > 0) {
                uint256 depositFee = _amount.mul(pool.depositFeeBP).div(10000);
                user.amount = user.amount.add(_amount).sub(depositFee);
                pool.lpToken.safeTransfer(feeAddress, depositFee);
            } else {
                user.amount = user.amount.add(_amount);
            }
            user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);
        }
        user.rewardDebt = user.amount.mul(pool.accPZapPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Deposit LP tokens to MasterChef for PZAP allocation with referral.
    function deposit(
        uint256 _pid,
        uint256 _amount,
        address _referrer
    ) public nonReentrant {
        require(_referrer == address(_referrer), "deposit: Invalid referrer address");
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        payOrLockupPendingPZap(_pid);
        if (_amount > 0) {
            setReferral(msg.sender, _referrer);
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            if (pool.depositFeeBP > 0) {
                uint256 depositFee = _amount.mul(pool.depositFeeBP).div(10000);
                user.amount = user.amount.add(_amount).sub(depositFee);
                pool.lpToken.safeTransfer(feeAddress, depositFee);
            } else {
                user.amount = user.amount.add(_amount);
            }
            user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);
        }
        user.rewardDebt = user.amount.mul(pool.accPZapPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        payOrLockupPendingPZap(_pid);
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accPZapPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Pay or lockup pending PZAP.
    function payOrLockupPendingPZap(uint256 _pid) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (user.nextHarvestUntil == 0) {
            user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);
        }

        uint256 pending = user.amount.mul(pool.accPZapPerShare).div(1e12).sub(user.rewardDebt);
        if (canHarvest(_pid, msg.sender)) {
            if (pending > 0 || user.rewardLockedUp > 0) {
                uint256 totalRewards = pending.add(user.rewardLockedUp);

                // reset lockup
                totalLockedUpRewards = totalLockedUpRewards.sub(user.rewardLockedUp);
                user.rewardLockedUp = 0;
                user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);

                // send rewards
                safePZapTransfer(msg.sender, totalRewards);
                payReferralCommission(msg.sender, totalRewards);
            }
        } else if (pending > 0) {
            user.rewardLockedUp = user.rewardLockedUp.add(pending);
            totalLockedUpRewards = totalLockedUpRewards.add(pending);
            emit RewardLockedUp(msg.sender, _pid, pending);
        }
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
        user.rewardLockedUp = 0;
        user.nextHarvestUntil = 0;
    }

    // Safe pZap transfer function, just in case if rounding error causes pool to not have enough PZAPs.
    function safePZapTransfer(address _to, uint256 _amount) internal {
        uint256 pZapBal = pZap.balanceOf(address(this));
        bool transferSuccess = false;
        if (_amount > pZapBal) {
            transferSuccess = pZap.transfer(_to, pZapBal);
        } else {
            transferSuccess = pZap.transfer(_to, _amount);
        }
        require(transferSuccess, "safePZapTransfer: transfer failed.");
    }

    // Update dev address by the previous dev.
    function setDevAddress(address _devaddr) public {
        require(_devaddr != address(0), "dev: invalid address");
        require(msg.sender == devAddr, "dev: wut?");
        devAddr = _devaddr;
        emit SetDevAddress(msg.sender, _devaddr);
    }

    // Update fee address by the previous fee address.
    function setFeeAddress(address _feeAddress) public {
        require(_feeAddress != address(0), "setFeeAddress: invalid address");
        require(msg.sender == feeAddress, "setFeeAddress: FORBIDDEN");
        feeAddress = _feeAddress;
        emit SetFeeAddress(msg.sender, _feeAddress);
    }

    // Update Emission Rate to control the emission per block (TimeLocked).
    function updateEmissionRate(uint256 _pZapPerBlock) public onlyOwner {
        massUpdatePools();
        pZapPerBlock = _pZapPerBlock;
        emit UpdateEmissionRate(msg.sender, _pZapPerBlock);
    }

    // Set Referral Address for a user
    function setReferral(address _user, address _referrer) internal {
        if (
            _referrer == address(_referrer) &&
            referrers[_user] == address(0) &&
            _referrer != address(0) &&
            _referrer != _user
        ) {
            referrers[_user] = _referrer;
            referredCount[_referrer] += 1;
            emit Referral(_user, _referrer);
        }
    }

    // Get Referral Address for a Account
    function getReferral(address _user) public view returns (address) {
        return referrers[_user];
    }

    // Pay referral commission to the referrer who referred this user.
    function payReferralCommission(address _user, uint256 _pending) internal {
        address referrer = getReferral(_user);
        if (referrer != address(0) && referrer != _user && refBonusBP > 0) {
            uint256 refBonusEarned = _pending.mul(refBonusBP).div(10000);
            safePZapTransfer(referrer, refBonusEarned);
            emit ReferralPaid(_user, referrer, refBonusEarned);
        }
    }

    // Referral Bonus in basis points.
    // Initially set to 2%, this this the ability to increase or decrease the Bonus percentage based on
    // community voting and feedback.
    function updateReferralBonusBp(uint256 _newRefBonusBp) public onlyOwner {
        require(
            _newRefBonusBp <= MAXIMUM_REFERRAL_BP,
            "updateRefBonusPercent: invalid referral bonus basis points"
        );
        require(_newRefBonusBp != refBonusBP, "updateRefBonusPercent: same bonus bp set");
        uint256 previousRefBonusBP = refBonusBP;
        refBonusBP = _newRefBonusBp;
        emit ReferralBonusBpChanged(previousRefBonusBP, _newRefBonusBp);
    }

    //Only update before start of farm
    function updateStartBlock(uint256 _startBlock) public onlyOwner {
        startBlock = _startBlock;
    }
}
