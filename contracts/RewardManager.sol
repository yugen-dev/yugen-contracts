// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "interfaces/IFYGNClaimableBurner.sol";
import "interfaces/IYGNStaker.sol";

contract RewardManager is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public bonusRewardsPool;

    address public rewardManagerFactory;

    // Call from excludedAddresses will be whitelisted & rewards harvested from farm will not be vested
    mapping(address => bool) public excludedAddresses;

    //Upfront rewards unlock in percentage. This number is later divided by 1000 for calculations.
    uint256 public upfrontUnlock;

    //Pre mature penalty in percentage. This number is later divided by 1000 for calculations.
    uint256 public preMaturePenalty;

    //Bonus Rewards in percentage. This number is later divided by 1000 for calculations.
    uint256 public bonusPercentage;

    /// @notice start of Distribution phase as a timestamp
    uint256 public startDistribution;

    /// @notice end of Distribution phase as a timestamp
    uint256 public endDistribution;

    //(fYGN) token address
    ERC20Burnable public fYGN;
    IERC20 public ygn;
    IFYGNClaimableBurner public fYGNClaimableBurner;
    IYGNStaker public ygnStaker;

    /// @notice amount vested for a user.
    mapping(address => uint256) public vestedAmount;

    /// @notice cumulative total of tokens drawn down (and transferred from the deposit account) per beneficiary
    mapping(address => uint256) public totalDrawn;

    /// @notice last drawn down time (seconds) per beneficiary
    mapping(address => uint256) public lastDrawnAt;

    /// @notice total tokens burnt per beneficiary
    mapping(address => uint256) public burntAmount;

    /// @notice bonus rewards entitled per beneficiary
    mapping(address => uint256) public bonusReward;

    /// @notice event emitted when a vesting schedule is created
    event Vested(address indexed _beneficiary, uint256 indexed value);

    /// @notice event emitted when a successful drawn down of vesting tokens is made
    event DrawDown(address indexed _beneficiary, uint256 indexed _amount, uint256 indexed bonus);

    /// @notice event emitted when a successful pre mature drawn down of vesting tokens is made
    event PreMatureDrawn(
        address indexed _beneficiary,
        uint256 indexed burntAmount,
        uint256 indexed userEffectiveWithdrawn
    );

    modifier checkPercentages(uint256 _percentage) {
        require(_percentage <= 1000, "Invalid Percentages");
        _;
    }

    modifier checkTime(uint256 _startDistribution, uint256 _endDistribution) {
        require(_endDistribution > _startDistribution, "end time should be greater than start");
        _;
    }

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    /**
     * @notice Construct a new Reward Manager contract
     * @param _fYGN fYGN token address
     * @param _ygn YGN token address
     * @param _fYGNClaimableBurner fYGNClaimableBurner address
     * @param _ygnStaker ygnStaker address
     * @param _startDistribution start timestamp
     * @param _endDistribution end timestamp
     * @param _upfrontUnlock Upfront unlock percentage
     * @param _preMaturePenalty Penalty percentage for pre mature withdrawal
     * @param _bonusPercentage Bonus rewards percentage for user who hasn't drawn any rewards untill endDistribution
     * @dev deployer of contract on constructor is set as owner
     */
    constructor(
        ERC20Burnable _fYGN,
        IERC20 _ygn,
        IFYGNClaimableBurner _fYGNClaimableBurner,
        IYGNStaker _ygnStaker,
        uint256 _startDistribution,
        uint256 _endDistribution,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty,
        uint256 _bonusPercentage
    ) checkTime(_startDistribution, _endDistribution) {
        fYGN = _fYGN;
        ygn = _ygn;
        fYGNClaimableBurner = _fYGNClaimableBurner;
        ygnStaker = _ygnStaker;
        startDistribution = _startDistribution;
        endDistribution = _endDistribution;
        upfrontUnlock = _upfrontUnlock;
        preMaturePenalty = _preMaturePenalty;
        bonusPercentage = _bonusPercentage;
        rewardManagerFactory = owner();
    }

    function _getNow() internal view returns (uint256) {
        return block.timestamp;
    }

    // Can be used by the owner to update the address for the FYGNClaimableBurner
    function updateFYGNClaimableBurner(IFYGNClaimableBurner _fYGNClaimableBurner)
        external
        ensureNonZeroAddress(address(_fYGNClaimableBurner))
        onlyOwner
    {
        fYGNClaimableBurner = _fYGNClaimableBurner;
    }

    // Can be used by the owner to update the address for the YGNStaker
    function updateYGNStaker(IYGNStaker _ygnStaker)
        external
        ensureNonZeroAddress(address(_ygnStaker))
        onlyOwner
    {
        ygnStaker = _ygnStaker;
    }

    // Can be used by the owner to update the address for the FYGN token
    function updateFYGN(ERC20Burnable _fYGN)
        external
        ensureNonZeroAddress(address(_fYGN))
        onlyOwner
    {
        fYGN = _fYGN;
    }

    // Can be used by the owner to update the address for the YGN token
    function updateYGN(IERC20 _ygn) external ensureNonZeroAddress(address(_ygn)) onlyOwner {
        ygn = _ygn;
    }

    function updatePreMaturePenalty(uint256 _newpreMaturePenalty)
        external
        checkPercentages(_newpreMaturePenalty)
        onlyOwner
    {
        preMaturePenalty = _newpreMaturePenalty;
    }

    function updateBonusPercentage(uint256 _newBonusPercentage)
        external
        checkPercentages(_newBonusPercentage)
        onlyOwner
    {
        bonusPercentage = _newBonusPercentage;
    }

    function updateDistributionTime(uint256 _updatedStartTime, uint256 _updatedEndTime)
        external
        checkTime(_updatedStartTime, _updatedEndTime)
        onlyOwner
    {
        require(startDistribution > _getNow(), "Vesting already started can't update now");
        startDistribution = _updatedStartTime;
        endDistribution = _updatedEndTime;
    }

    function updateUpfrontUnlock(uint256 _newUpfrontUnlock)
        external
        checkPercentages(_newUpfrontUnlock)
        onlyOwner
    {
        upfrontUnlock = _newUpfrontUnlock;
    }

    function updateWhitelistAddress(address _excludeAddress, bool status) external onlyOwner {
        excludedAddresses[_excludeAddress] = status;
    }

    function handleRewardsForUser(
        address _user,
        uint256 _rewardAmount,
        bool _userWantsToStake
    ) external onlyOwner {
        if (_rewardAmount > 0) {
            if (excludedAddresses[_user]) {
                IERC20(address(fYGN)).safeTransfer(_user, _rewardAmount);
            } else {
                uint256 upfrontAmount = _rewardAmount.mul(upfrontUnlock).div(1000);
                if (_userWantsToStake) {
                    _burnAndStake(_user, upfrontAmount);
                } else {
                    IERC20(address(fYGN)).safeTransfer(_user, upfrontAmount);
                }

                _vest(_user, _rewardAmount.sub(upfrontAmount));
            }
        }
    }

    function _vest(address _user, uint256 _amount) internal {
        require(_getNow() < startDistribution, "Cannot vest in distribution phase");
        require(_user != address(0), "Cannot vest for Zero address");

        vestedAmount[_user] = vestedAmount[_user].add(_amount);

        emit Vested(_user, _amount);
    }

    /**
     * @notice Vesting schedule data associated for a user
     * @dev Must be called directly by the beneficiary assigned the tokens in the schedule
     * @return totalVested Total vested amount for user
     * @return totalDrawnAmount total token drawn by user
     * @return amountBurnt total amount burnt while pre maturely drawing
     * @return claimable token available to be claimed
     * @return bonusRewards tokens a user will get if nothing has been withdrawn untill endDistribution
     * @return stillDue tokens still due (and currently locked) from vesting schedule
     */
    function vestingInfo(address _user)
        public
        view
        returns (
            uint256 totalVested,
            uint256 totalDrawnAmount,
            uint256 amountBurnt,
            uint256 claimable,
            uint256 bonusRewards,
            uint256 stillDue
        )
    {
        return (
            vestedAmount[_user],
            totalDrawn[_user],
            burntAmount[_user],
            _availableDrawDownAmount(_user),
            bonusReward[_user],
            _remainingBalance(_user)
        );
    }

    function _availableDrawDownAmount(address _user) internal view returns (uint256) {
        uint256 currentTime = _getNow();
        if (currentTime < startDistribution || totalDrawn[_user] == vestedAmount[_user]) {
            return 0;
        } else if (currentTime >= endDistribution) {
            return _remainingBalance(_user);
        } else {
            // Work out when the last invocation was
            uint256 timeLastDrawnOrStart = lastDrawnAt[_user] == 0
                ? startDistribution
                : lastDrawnAt[_user];

            // Find out how much time has past since last invocation
            uint256 timePassedSinceLastInvocation = currentTime.sub(timeLastDrawnOrStart);

            uint256 _remainingVestingTime = endDistribution.sub(timeLastDrawnOrStart);

            return
                _remainingBalance(_user).mul(timePassedSinceLastInvocation).div(
                    _remainingVestingTime
                );
        }
    }

    function _remainingBalance(address _user) internal view returns (uint256) {
        return vestedAmount[_user].sub(totalDrawn[_user]);
    }

    /**
     * @notice Draws down any vested tokens due
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function drawDown(address _user, bool _userWantsToStake) external onlyOwner nonReentrant {
        require(_getNow() > startDistribution, "Vesting not yet started");
        return _drawDown(_user, _userWantsToStake);
    }

    /**
     * @notice Pre maturely Draws down all vested tokens by burning the preMaturePenalty
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function preMatureDraw(address _beneficiary, bool _userWantsToStake)
        external
        onlyOwner
        nonReentrant
    {
        uint256 remainingBalance = _remainingBalance(_beneficiary);
        require(remainingBalance > 0, "Nothing left to draw");

        _drawDown(_beneficiary, _userWantsToStake);
        remainingBalance = _remainingBalance(_beneficiary);
        if (remainingBalance > 0) {
            uint256 burnAmount = remainingBalance.mul(preMaturePenalty).div(1000);
            uint256 effectiveAmount = remainingBalance.sub(burnAmount);

            totalDrawn[_beneficiary] = vestedAmount[_beneficiary];
            burntAmount[_beneficiary] = burntAmount[_beneficiary].add(burnAmount);
            fYGN.burn(burnAmount);
            if (_userWantsToStake) {
                _burnAndStake(_beneficiary, effectiveAmount);
            } else {
                IERC20(address(fYGN)).safeTransfer(_beneficiary, effectiveAmount);
            }
            emit PreMatureDrawn(_beneficiary, burnAmount, effectiveAmount);
        }
    }

    function _drawDown(address _beneficiary, bool _userWantsToStake) internal {
        require(vestedAmount[_beneficiary] > 0, "No vesting found");

        uint256 amount = _availableDrawDownAmount(_beneficiary);
        if (amount == 0) return;

        uint256 currentTime = _getNow();

        if (currentTime > endDistribution && totalDrawn[_beneficiary] == 0) {
            bonusReward[_beneficiary] = amount.mul(bonusPercentage).div(1000);
        }

        // Update last drawn to now
        lastDrawnAt[_beneficiary] = currentTime;
        // Increase total drawn amount
        totalDrawn[_beneficiary] = totalDrawn[_beneficiary].add(amount);

        // Safety measure - this should never trigger
        require(
            totalDrawn[_beneficiary] <= vestedAmount[_beneficiary],
            "Safety Mechanism - Drawn exceeded Amount Vested"
        );

        if (_userWantsToStake) {
            // Issue xYGN to beneficiary
            _burnAndStake(_beneficiary, amount.add(bonusReward[_beneficiary]));
        } else {
            // Issue tokens to beneficiary
            IERC20(address(fYGN)).safeTransfer(_beneficiary, amount.add(bonusReward[_beneficiary]));
        }

        emit DrawDown(_beneficiary, amount, bonusReward[_beneficiary]);
    }

    function _burnAndStake(address _beneficiary, uint256 _fYGNShare)
        internal
        returns (uint256 xYGNAmount)
    {
        uint256 ygnAmount = fYGNClaimableBurner.getYGNAmount(_fYGNShare);
        IERC20(fYGN).safeApprove(address(fYGNClaimableBurner), _fYGNShare);
        fYGNClaimableBurner.leave(_fYGNShare);

        ygn.safeApprove(address(ygnStaker), ygnAmount);
        ygnStaker.enterFor(_beneficiary, ygnAmount);
        xYGNAmount = ygnStaker.getXYGNAmount(ygnAmount);
    }

    /**
     * @notice Function to add Bonus Rewards for user who hasn't vested any amount untill endDistribution
     * @dev Must be called directly by the owner
     */
    function addBonusRewards(uint256 _bonusRewards) external onlyOwner {
        bonusRewardsPool = bonusRewardsPool.add(_bonusRewards);
    }

    /**
     * @notice Function to remove any extra Bonus Rewards sent to this contract
     * @dev Must be called directly by the owner
     */
    function removeBonusRewards(address _owner) external onlyOwner {
        uint256 fYGNBalance = fYGN.balanceOf(address(this));
        uint256 bonus = bonusRewardsPool;
        bonusRewardsPool = 0;
        if (fYGNBalance < bonus) {
            IERC20(address(fYGN)).safeTransfer(_owner, fYGNBalance);
        } else {
            IERC20(address(fYGN)).safeTransfer(_owner, bonus);
        }
    }
}
