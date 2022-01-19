// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "interfaces/IRewardManager.sol";
import "interfaces/IFYGN.sol";
import "interfaces/IStrategy.sol";

// Farm is the major distributor of FYGN to the community. He gives juicy FYGN rewards as per user's stake.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once FYGN is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract Farm is Ownable, ReentrancyGuard, Pausable {
    using SafeMath for uint256;
    using SafeMath for uint16;
    using SafeERC20 for IERC20;
    using Address for address;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 rewardLockedUp; // Reward locked up.
        uint256 nextHarvestUntil; // When can the user harvest again.
        //
        // We do some fancy math here. Basically, any point in time, the amount of FYGNs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accfYGNPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accfYGNPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. fYGNs to distribute per block.
        uint256 lastRewardBlock; // Last block number that fYGNs distribution occurs.
        uint256 accfYGNPerShare; // Accumulated fYGNs per share, times 1e12. See below.
        uint16 withdrawalFeeBP; // Deposit fee in basis points
        uint256 harvestInterval; // Harvest interval in seconds
        uint256 totalInputTokensStaked; //Total input tokens staked
        IStrategy strategy; //strategy address
    }

    IFYGN public fYGN; // The fYGN TOKEN!
    uint256 public fYGNPerBlock; // FYGN tokens minted per block.
    address public ygnConverter; // YGN Converter address
    uint256 public startBlock; // The block number when fYGN minting starts.
    uint256 public bonusEndBlock; // Block number when bonus FYGN period ends.

    uint256 public BONUS_MULTIPLIER = 1; // Bonus muliplier for early fygn makers.
    uint256 public totalAllocPoint = 0; // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalLockedUpRewards; // Total locked up rewards

    uint256 public constant MAXIMUM_HARVEST_INTERVAL = 14 days; // Max harvest interval: 14 days.
    uint16 public constant MAXIMUM_WITHDRAWAL_FEE_BP = 1000; // Max withdrawal fee: 10%.
    uint256 public constant ACC_FYGN_PRECISION = 1e12;

    bool public isRewardManagerEnabled; //Trigger for RewardManager mode
    address public rewardManager; //Address for reward manager

    PoolInfo[] public poolInfo; // Info of each pool.

    mapping(uint256 => mapping(address => UserInfo)) public userInfo; // Info of each user that stakes LP tokens.

    mapping(address => mapping(address => bool)) public whiteListedHandlers;

    event PoolAddition(
        uint256 indexed pid,
        uint256 allocPoint,
        IERC20 indexed lpToken,
        uint16 withdrawalFeeBP,
        uint256 harvestInterval,
        IStrategy strategy
    );
    event UpdatedPoolAlloc(
        uint256 indexed pid,
        uint256 allocPoint,
        uint16 withdrawalFeeBP,
        uint256 harvestInterval
    );
    event UpdatedPoolAllocPoint(uint256 indexed pid, uint256 allocPoint);
    event UpdatedPoolStrategy(uint256 indexed pid, IStrategy strategy);
    event UpdatedPoolWithdrawalFeeBP(uint256 indexed pid, uint256 withdrawalFeeBP);
    event UpdatedPoolHarvestInterval(uint256 indexed pid, uint256 harvestInterval);
    event PoolUpdated(
        uint256 indexed pid,
        uint256 lastRewardBlock,
        uint256 lpSupply,
        uint256 accfYGNPerShare
    );
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event SetYGNConverter(address indexed user, address indexed ygnConverter);
    event RewardLockedUp(address indexed user, uint256 indexed pid, uint256 amountLockedUp);
    event BonusMultiplierUpdated(uint256 _bonusMultiplier);
    event BlockRateUpdated(uint256 _blockRate);
    event UserWhitelisted(address _primaryUser, address _whitelistedUser);
    event UserBlacklisted(address _primaryUser, address _blacklistedUser);

    modifier validatePoolByPid(uint256 _pid) {
        require(_pid < poolInfo.length, "Pool does not exist");
        _;
    }

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    constructor(
        IFYGN _fYGN,
        uint256 _fYGNPerBlock,
        address _ygnConverter,
        uint256 _startBlock,
        uint256 _bonusEndBlock
    ) {
        fYGN = _fYGN;
        fYGNPerBlock = _fYGNPerBlock;
        ygnConverter = _ygnConverter;
        startBlock = _startBlock;
        bonusEndBlock = _bonusEndBlock;
        isRewardManagerEnabled = false;
        rewardManager = address(0);
    }

    //Only Owner Functions

    function updateBonusMultiplier(uint256 multiplierNumber) external onlyOwner {
        massUpdatePools();
        BONUS_MULTIPLIER = multiplierNumber;
        emit BonusMultiplierUpdated(BONUS_MULTIPLIER);
    }

    function updateBlockRate(uint256 _fYGNPerBlock) external onlyOwner {
        massUpdatePools();
        fYGNPerBlock = _fYGNPerBlock;
        emit BlockRateUpdated(_fYGNPerBlock);
    }

    function updateRewardManagerMode(bool _isRewardManagerEnabled) external onlyOwner {
        massUpdatePools();
        isRewardManagerEnabled = _isRewardManagerEnabled;
    }

    function updateRewardManager(address _rewardManager)
        external
        onlyOwner
        ensureNonZeroAddress(_rewardManager)
    {
        massUpdatePools();
        rewardManager = _rewardManager;
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

    // Add a new lp to the pool. Can only be called by the owner.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
        uint16 _withdrawalFeeBP,
        uint256 _harvestInterval,
        IStrategy _strategy,
        bool _withUpdate
    ) external onlyOwner ensureNonZeroAddress(address(_lpToken)) nonReentrant {
        require(
            _withdrawalFeeBP <= MAXIMUM_WITHDRAWAL_FEE_BP,
            "add: invalid withdrawal fee basis points"
        );
        require(_harvestInterval <= MAXIMUM_HARVEST_INTERVAL, "add: invalid harvest interval");

        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accfYGNPerShare: 0,
                withdrawalFeeBP: _withdrawalFeeBP,
                harvestInterval: _harvestInterval,
                totalInputTokensStaked: 0,
                strategy: _strategy
            })
        );

        emit PoolAddition(
            poolInfo.length.sub(1),
            _allocPoint,
            _lpToken,
            _withdrawalFeeBP,
            _harvestInterval,
            _strategy
        );
    }

    function updatePoolAllocPoint(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) external onlyOwner validatePoolByPid(_pid) nonReentrant {
        if (_withUpdate) {
            massUpdatePools();
        } else {
            updatePool(_pid);
        }
        PoolInfo storage pool = poolInfo[_pid];
        totalAllocPoint = totalAllocPoint.sub(pool.allocPoint).add(_allocPoint);
        pool.allocPoint = _allocPoint;
        emit UpdatedPoolAllocPoint(_pid, _allocPoint);
    }

    function updatePoolWithdrawalFeeBP(
        uint256 _pid,
        uint16 _withdrawalFeeBP,
        bool _withUpdate
    ) external onlyOwner validatePoolByPid(_pid) nonReentrant {
        require(
            _withdrawalFeeBP <= MAXIMUM_WITHDRAWAL_FEE_BP,
            "set: invalid withdrawal fee basis points"
        );
        if (_withUpdate) {
            massUpdatePools();
        } else {
            updatePool(_pid);
        }
        PoolInfo storage pool = poolInfo[_pid];
        pool.withdrawalFeeBP = _withdrawalFeeBP;
        emit UpdatedPoolWithdrawalFeeBP(_pid, _withdrawalFeeBP);
    }

    function updatePoolHarvestInterval(
        uint256 _pid,
        uint256 _harvestInterval,
        bool _withUpdate
    ) external onlyOwner validatePoolByPid(_pid) nonReentrant {
        require(_harvestInterval <= MAXIMUM_HARVEST_INTERVAL, "add: invalid harvest interval");
        if (_withUpdate) {
            massUpdatePools();
        } else {
            updatePool(_pid);
        }
        PoolInfo storage pool = poolInfo[_pid];
        pool.harvestInterval = _harvestInterval;
        emit UpdatedPoolHarvestInterval(_pid, _harvestInterval);
    }

    //Shouldn't be used and only be used when no LP tokens are staked
    function updatePoolStrategy(
        uint256 _pid,
        IStrategy _strategy,
        bool _withUpdate
    ) external onlyOwner validatePoolByPid(_pid) nonReentrant {
        if (_withUpdate) {
            massUpdatePools();
        } else {
            updatePool(_pid);
        }
        PoolInfo storage pool = poolInfo[_pid];
        pool.strategy = _strategy;
        emit UpdatedPoolStrategy(_pid, _strategy);
    }

    // Update the given pool's fYGN allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        uint16 _withdrawalFeeBP,
        uint256 _harvestInterval,
        bool _withUpdate
    ) external onlyOwner validatePoolByPid(_pid) nonReentrant {
        require(
            _withdrawalFeeBP <= MAXIMUM_WITHDRAWAL_FEE_BP,
            "set: invalid deposit fee basis points"
        );
        require(_harvestInterval <= MAXIMUM_HARVEST_INTERVAL, "add: invalid harvest interval");
        if (_withUpdate) {
            massUpdatePools();
        } else {
            updatePool(_pid);
        }
        PoolInfo storage pool = poolInfo[_pid];
        totalAllocPoint = totalAllocPoint.sub(pool.allocPoint).add(_allocPoint);
        pool.allocPoint = _allocPoint;
        pool.withdrawalFeeBP = _withdrawalFeeBP;
        pool.harvestInterval = _harvestInterval;

        emit UpdatedPoolAlloc(_pid, _allocPoint, _withdrawalFeeBP, _harvestInterval);
    }

    function withdrawFYGN(uint256 _amount) external onlyOwner nonReentrant {
        IERC20(address(fYGN)).safeTransfer(_msgSender(), _amount);
    }

    function pause() external onlyOwner nonReentrant {
        _pause();
    }

    function unpause() external onlyOwner nonReentrant {
        _unpause();
    }

    //View Functions

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from).mul(BONUS_MULTIPLIER);
    }

    function getLpTokenAmount(uint256 _pid)
        public
        view
        validatePoolByPid(_pid)
        returns (uint256 lpSupply)
    {
        PoolInfo storage pool = poolInfo[_pid];
        if (address(pool.strategy) != address(0)) {
            lpSupply = pool.strategy.totalInputTokensStaked();
        } else {
            lpSupply = pool.totalInputTokensStaked;
        }
    }

    // View function to see pending fYGNs on frontend.
    function pendingFYGN(uint256 _pid, address _user)
        external
        view
        validatePoolByPid(_pid)
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accfYGNPerShare = pool.accfYGNPerShare;
        uint256 lpSupply = pool.totalInputTokensStaked;
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 fygnReward = multiplier.mul(fYGNPerBlock).mul(pool.allocPoint).div(
                totalAllocPoint
            );
            accfYGNPerShare = accfYGNPerShare.add(fygnReward.mul(ACC_FYGN_PRECISION).div(lpSupply));
        }
        uint256 pending = user.amount.mul(accfYGNPerShare).div(ACC_FYGN_PRECISION).sub(
            user.rewardDebt
        );
        return pending.add(user.rewardLockedUp);
    }

    // View function to see if user can harvest fYGN's.
    function canHarvest(uint256 _pid, address _user)
        public
        view
        validatePoolByPid(_pid)
        returns (bool)
    {
        UserInfo memory user = userInfo[_pid][_user];
        return block.timestamp >= user.nextHarvestUntil;
    }

    // View function to see if user harvest until time.
    function getHarvestUntil(uint256 _pid, address _user)
        external
        view
        validatePoolByPid(_pid)
        returns (uint256)
    {
        UserInfo memory user = userInfo[_pid][_user];
        return user.nextHarvestUntil;
    }

    function isUserWhiteListed(address _owner, address _user) external view returns (bool) {
        return whiteListedHandlers[_owner][_user];
    }

    //Public And External Functions for User and Internal Functions

    function addUserToWhiteList(address _user) external ensureNonZeroAddress(_user) {
        whiteListedHandlers[_msgSender()][_user] = true;
        emit UserWhitelisted(_msgSender(), _user);
    }

    function removeUserFromWhiteList(address _user) external ensureNonZeroAddress(_user) {
        whiteListedHandlers[_msgSender()][_user] = false;
        emit UserBlacklisted(_msgSender(), _user);
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public validatePoolByPid(_pid) {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.totalInputTokensStaked;
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 fygnReward = multiplier.mul(fYGNPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        pool.accfYGNPerShare = pool.accfYGNPerShare.add(
            fygnReward.mul(ACC_FYGN_PRECISION).div(lpSupply)
        );

        fYGN.mint(address(this), fygnReward);

        pool.lastRewardBlock = block.number;
        emit PoolUpdated(_pid, pool.lastRewardBlock, lpSupply, pool.accfYGNPerShare);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Deposit LP tokens to Farm for fYGN allocation.
    function deposit(
        uint256 _pid,
        uint256 _amount,
        bool _userWantsToStake
    ) external validatePoolByPid(_pid) nonReentrant whenNotPaused {
        _deposit(_pid, _amount, _msgSender(), _userWantsToStake);
    }

    // Deposit LP tokens to Farm for fYGN allocation.
    function depositFor(
        uint256 _pid,
        uint256 _amount,
        address _user,
        bool _userWantsToStake
    ) external validatePoolByPid(_pid) nonReentrant ensureNonZeroAddress(_user) whenNotPaused {
        _deposit(_pid, _amount, _user, _userWantsToStake);
    }

    function _deposit(
        uint256 _pid,
        uint256 _amount,
        address _user,
        bool _userWantsToStake
    ) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        whiteListedHandlers[_user][_user] = true;

        updatePool(_pid);
        _payOrLockupPendingFYGN(_pid, _user, _user, _userWantsToStake);

        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(_msgSender()), address(this), _amount);
            uint256 depositedAmount;
            if (address(pool.strategy) != address(0)) {
                pool.lpToken.safeApprove(address(pool.strategy), _amount);
                depositedAmount = pool.strategy.deposit(address(pool.lpToken), _amount);
            } else {
                depositedAmount = _amount;
            }
            user.amount = user.amount.add(depositedAmount);
            user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);
            pool.totalInputTokensStaked = pool.totalInputTokensStaked.add(depositedAmount);
        }
        user.rewardDebt = user.amount.mul(pool.accfYGNPerShare).div(ACC_FYGN_PRECISION);
        emit Deposit(_user, _pid, _amount);
    }

    // Withdraw LP tokens from Farm.
    function withdraw(
        uint256 _pid,
        uint256 _amount,
        bool _userWantsToStake
    ) external validatePoolByPid(_pid) nonReentrant whenNotPaused {
        _withdraw(_pid, _amount, _msgSender(), _msgSender(), _userWantsToStake);
    }

    // Withdraw LP tokens from Farm.
    function withdrawFor(
        uint256 _pid,
        uint256 _amount,
        address _user,
        bool _userWantsToStake
    ) external validatePoolByPid(_pid) nonReentrant ensureNonZeroAddress(_user) whenNotPaused {
        require(whiteListedHandlers[_user][_msgSender()], "not whitelisted");
        _withdraw(_pid, _amount, _user, _msgSender(), _userWantsToStake);
    }

    function _withdraw(
        uint256 _pid,
        uint256 _amount,
        address _user,
        address _withdrawer,
        bool _userWantsToStake
    ) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];

        require(user.amount >= _amount, "withdraw: not good");

        updatePool(_pid);
        _payOrLockupPendingFYGN(_pid, _user, _withdrawer, _userWantsToStake);

        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            uint256 withdrawnAmount;
            if (address(pool.strategy) != address(0)) {
                withdrawnAmount = pool.strategy.withdraw(address(pool.lpToken), _amount);
                pool.lpToken.safeTransferFrom(
                    address(pool.strategy),
                    address(this),
                    withdrawnAmount
                );
            } else {
                withdrawnAmount = _amount;
            }

            if (pool.withdrawalFeeBP > 0) {
                uint256 withdrawalFee = withdrawnAmount.mul(pool.withdrawalFeeBP).div(10000);
                pool.lpToken.safeTransfer(ygnConverter, withdrawalFee);
                pool.lpToken.safeTransfer(address(_withdrawer), withdrawnAmount.sub(withdrawalFee));
            } else {
                pool.lpToken.safeTransfer(address(_withdrawer), withdrawnAmount);
            }
        }
        pool.totalInputTokensStaked = pool.totalInputTokensStaked.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accfYGNPerShare).div(ACC_FYGN_PRECISION);
        emit Withdraw(_user, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) external validatePoolByPid(_pid) nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_msgSender()];
        uint256 withdrawnAmount;
        if (address(pool.strategy) != address(0)) {
            withdrawnAmount = pool.strategy.withdraw(address(pool.lpToken), user.amount);
            pool.lpToken.safeTransferFrom(address(pool.strategy), address(this), withdrawnAmount);
        } else {
            withdrawnAmount = user.amount;
        }
        pool.lpToken.safeTransfer(address(_msgSender()), withdrawnAmount);
        emit EmergencyWithdraw(_msgSender(), _pid, user.amount);
        pool.totalInputTokensStaked = pool.totalInputTokensStaked.sub(user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
        user.rewardLockedUp = 0;
        user.nextHarvestUntil = 0;
    }

    // Pay or lockup pending fYGN.
    function _payOrLockupPendingFYGN(
        uint256 _pid,
        address _user,
        address _withdrawer,
        bool _userWantsToStake
    ) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        if (user.nextHarvestUntil == 0) {
            user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);
        }

        uint256 pending = user.amount.mul(pool.accfYGNPerShare).div(ACC_FYGN_PRECISION).sub(
            user.rewardDebt
        );
        if (canHarvest(_pid, _user)) {
            if (pending > 0 || user.rewardLockedUp > 0) {
                uint256 totalRewards = pending.add(user.rewardLockedUp);

                // reset lockup
                totalLockedUpRewards = totalLockedUpRewards.sub(user.rewardLockedUp);
                user.rewardLockedUp = 0;
                user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);

                // send rewards
                if (isRewardManagerEnabled == true) {
                    _safeFYGNTransfer(rewardManager, totalRewards);
                    IRewardManager(rewardManager).handleRewardsForUser(
                        _withdrawer,
                        totalRewards,
                        _userWantsToStake
                    );
                } else {
                    _safeFYGNTransfer(_withdrawer, totalRewards);
                }
            }
        } else if (pending > 0) {
            user.rewardLockedUp = user.rewardLockedUp.add(pending);
            totalLockedUpRewards = totalLockedUpRewards.add(pending);
            emit RewardLockedUp(_user, _pid, pending);
        }
    }

    // Safe fygn transfer function, just in case if rounding error causes pool to not have enough fYGNs.
    function _safeFYGNTransfer(address _to, uint256 _amount) internal {
        uint256 fygnBal = fYGN.balanceOf(address(this));
        if (_amount > fygnBal) {
            IERC20(address(fYGN)).safeTransfer(_to, fygnBal);
        } else {
            IERC20(address(fYGN)).safeTransfer(_to, _amount);
        }
    }
}
