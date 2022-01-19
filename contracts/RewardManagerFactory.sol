// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "interfaces/IRewardManager.sol";
import "interfaces/IFYGNClaimableBurner.sol";
import "interfaces/IYGNStaker.sol";

contract RewardManagerFactory is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeMath for uint128;
    using SafeERC20 for IERC20;

    /// @notice all the information for this RewardManager in one struct
    struct RewardManagerInfo {
        address managerAddress;
        uint256 startDistribution;
        uint256 endDistribution;
    }

    struct UserInfo {
        uint256 _totalVested;
        uint256 _totalDrawnAmount;
        uint256 _amountBurnt;
        uint256 _claimable;
        uint256 _bonusRewards;
        uint256 _stillDue;
    }

    RewardManagerInfo[] public managers;

    uint256 public totalRewardManagers;

    mapping(address => uint256) public managerIndex;

    // whitelisted rewardDistributors
    mapping(address => bool) public rewardDistributor;

    // (fYGN) token address
    IERC20 public fYGN;

    event RewardManagerLaunched(
        address indexed managerAddress,
        uint256 indexed startDistributionTime,
        uint256 indexed endDistributionTime
    );

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    /**
     * @notice Construct a new Reward Manager Factory contract
     * @param _fYGN fYGN token address
     * @dev deployer of contract on constructor is set as owner
     */
    constructor(IERC20 _fYGN) {
        fYGN = _fYGN;
    }

    modifier validateRewardManagerByIndex(uint256 _index) {
        require(_index < managers.length, "Reward Manager does not exist");
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        require(address(manager) != address(0), "Reward Manager Address cannot be zero address");
        _;
    }

    /**
     * @notice Creates a new Reward Manager contract and registers it in the Factory Contract
     * @param _fYGN fYGN token address
     * @param _ygn YGN token address
     * @param _fYGNClaimableBurner fYGNClaimableBurner address
     * @param _ygnStaker ygnStaker address
     * @param _startDistribution start timestamp
     * @param _endDistribution end timestamp
     * @param _upfrontUnlock Upfront unlock percentage
     * @param _preMaturePenalty Penalty percentage for pre mature withdrawal
     * @param _bonusPercentage Bonus rewards percentage for user who hasn't drawn any rewards untill endDistribution
     * @param _rewardManagerByteCode Bytecode of the reward manager contract to be deployed
     * @dev deployer of contract on constructor is set as owner
     */
    function launchRewardManager(
        ERC20Burnable _fYGN,
        IERC20 _ygn,
        IFYGNClaimableBurner _fYGNClaimableBurner,
        IYGNStaker _ygnStaker,
        uint256 _startDistribution,
        uint256 _endDistribution,
        uint256 _upfrontUnlock,
        uint256 _preMaturePenalty,
        uint256 _bonusPercentage,
        bytes memory _rewardManagerByteCode
    ) public onlyOwner {
        require(address(_fYGN) != address(0), "FYGN token cant be Zero address");
        require(address(_ygn) != address(0), "YGN token cant be Zero address");
        require(address(_fYGNClaimableBurner) != address(0), "Burner cant be Zero address");
        require(address(_ygnStaker) != address(0), "Staker cant be Zero address");

        require(_startDistribution >= block.timestamp, "Start time should be greater than current"); // ideally at least 24 hours more to give investors time
        require(
            _endDistribution > _startDistribution,
            "EndDistribution should be more than startDistribution"
        );

        uint256 salt = block.timestamp;
        bytes memory bytecode = abi.encodePacked(
            _rewardManagerByteCode,
            abi.encode(
                _fYGN,
                _ygn,
                _fYGNClaimableBurner,
                _ygnStaker,
                _startDistribution,
                _endDistribution,
                _upfrontUnlock,
                _preMaturePenalty,
                _bonusPercentage
            )
        );

        address newRewardManagerAddress;
        assembly {
            newRewardManagerAddress := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(newRewardManagerAddress)) {
                revert(0, 0)
            }
        }

        IRewardManager newManager = IRewardManager(newRewardManagerAddress);

        managers.push(
            RewardManagerInfo({
                managerAddress: address(newManager),
                startDistribution: _startDistribution,
                endDistribution: _endDistribution
            })
        );

        managerIndex[address(newManager)] = totalRewardManagers; //mapping every manager address to its index in the array

        emit RewardManagerLaunched(address(newManager), _startDistribution, _endDistribution);
        totalRewardManagers++;
    }

    function removeRewardManager(uint256 _index) public onlyOwner {
        require(_index < totalRewardManagers, "Invalid Index");
        delete managers[_index];
    }

    function userTotalVestingInfo(address _user)
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
        UserInfo memory user;
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (
                    user._totalVested,
                    user._totalDrawnAmount,
                    user._amountBurnt,
                    user._claimable,
                    user._bonusRewards,
                    user._stillDue
                ) = manager.vestingInfo(_user);

                if (user._totalVested > 0) {
                    totalVested += user._totalVested;
                    totalDrawnAmount += user._totalDrawnAmount;
                    amountBurnt += user._amountBurnt;
                    claimable += user._claimable;
                    bonusRewards += user._bonusRewards;
                    stillDue += user._stillDue;
                }
            }
        }
    }

    function handleRewardsForUser(
        address _user,
        uint256 _rewardAmount,
        bool _userWantsToStake
    ) external {
        require(rewardDistributor[msg.sender], "Not a valid RewardDistributor");
        //get the most active reward manager
        IRewardManager manager = IRewardManager(managers[managers.length - 1].managerAddress);
        require(address(manager) != address(0), "No Reward Manager Added");
        /* No use of if condition here to check if AddressZero since funds are transferred before calling handleRewardsForUser. Require is a must
        So if there is accidentally no strategy linked, it goes into else resulting in loss of user's funds.
        */
        fYGN.safeTransfer(address(manager), _rewardAmount);
        manager.handleRewardsForUser(_user, _rewardAmount, _userWantsToStake);
    }

    /**
     * @notice Draws down any vested tokens due in all Reward Manager
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function drawDown() external nonReentrant {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (, , , uint256 userClaimable, , ) = manager.vestingInfo(msg.sender);
                if (userClaimable > 0) {
                    manager.drawDown(msg.sender, false);
                }
            }
        }
    }

    /**
     * @notice Pre maturely Draws down all vested tokens by burning the preMaturePenalty
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function preMatureDraw() external nonReentrant {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (, , , , , uint256 userStillDue) = manager.vestingInfo(msg.sender);
                if (userStillDue > 0) {
                    manager.preMatureDraw(msg.sender, false);
                }
            }
        }
    }

    /**
     * @notice Draws down any vested tokens due in all Reward Managers, burned and then staked for xYGN
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function drawDownAndStake() external nonReentrant {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (, , , uint256 userClaimable, , ) = manager.vestingInfo(msg.sender);
                if (userClaimable > 0) {
                    manager.drawDown(msg.sender, true);
                }
            }
        }
    }

    /**
     * @notice Pre maturely Draws down all vested tokens by burning the preMaturePenalty and the rest burned and then staked for xYGN
     * @dev Must be called directly by the beneficiary assigned the tokens in the vesting
     */
    function preMatureDrawAndStake() external nonReentrant {
        for (uint256 i = 0; i < totalRewardManagers; i++) {
            address rewardManagerAddress = managers[i].managerAddress;
            if (rewardManagerAddress != address(0)) {
                IRewardManager manager = IRewardManager(rewardManagerAddress);
                (, , , , , uint256 userStillDue) = manager.vestingInfo(msg.sender);
                if (userStillDue > 0) {
                    manager.preMatureDraw(msg.sender, true);
                }
            }
        }
    }

    function updatePreMaturePenalty(uint256 _index, uint256 _newpreMaturePenalty)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updatePreMaturePenalty(_newpreMaturePenalty);
    }

    function updateBonusPercentage(uint256 _index, uint256 _newBonusPercentage)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateBonusPercentage(_newBonusPercentage);
    }

    function updateDistributionTime(
        uint256 _index,
        uint256 _updatedStartTime,
        uint256 _updatedEndTime
    ) external onlyOwner validateRewardManagerByIndex(_index) {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateDistributionTime(_updatedStartTime, _updatedEndTime);
        managers[_index].startDistribution = _updatedStartTime;
        managers[_index].endDistribution = _updatedEndTime;
    }

    function updateUpfrontUnlock(uint256 _index, uint256 _newUpfrontUnlock)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateUpfrontUnlock(_newUpfrontUnlock);
    }

    function updateWhitelistAddress(
        uint256 _index,
        address _excludeAddress,
        bool status
    ) external onlyOwner validateRewardManagerByIndex(_index) {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateWhitelistAddress(_excludeAddress, status);
    }

    function updateRewardDistributor(address _distributor, bool status) external onlyOwner {
        rewardDistributor[_distributor] = status;
    }

    function addBonusRewards(uint256 _index, uint256 _bonusRewards)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        fYGN.safeTransferFrom(msg.sender, address(manager), _bonusRewards);
        manager.addBonusRewards(_bonusRewards);
    }

    function removeBonusRewards(uint256 _index, address _owner)
        external
        onlyOwner
        validateRewardManagerByIndex(_index)
    {
        require(
            address(_owner) != address(0),
            "Address of owner receiving rewards should not be zero"
        );
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.removeBonusRewards(_owner);
    }

    // Can be used by the owner to update the address for the FYGNClaimableBurner
    function updateFYGNClaimableBurner(uint256 _index, IFYGNClaimableBurner _fYGNClaimableBurner)
        external
        ensureNonZeroAddress(address(_fYGNClaimableBurner))
        validateRewardManagerByIndex(_index)
        onlyOwner
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateFYGNClaimableBurner(_fYGNClaimableBurner);
    }

    // Can be used by the owner to update the address for the YGNStaker
    function updateYGNStaker(uint256 _index, IYGNStaker _ygnStaker)
        external
        ensureNonZeroAddress(address(_ygnStaker))
        validateRewardManagerByIndex(_index)
        onlyOwner
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateYGNStaker(_ygnStaker);
    }

    // Can be used by the owner to update the address for the FYGN token
    function updateFYGN(uint256 _index, IERC20 _fYGN)
        external
        ensureNonZeroAddress(address(_fYGN))
        validateRewardManagerByIndex(_index)
        onlyOwner
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateFYGN(ERC20Burnable(address(_fYGN)));
        fYGN = _fYGN;
    }

    // Can be used by the owner to update the address for the YGN token
    function updateYGN(uint256 _index, IERC20 _ygn)
        external
        ensureNonZeroAddress(address(_ygn))
        validateRewardManagerByIndex(_index)
        onlyOwner
    {
        IRewardManager manager = IRewardManager(managers[_index].managerAddress);
        manager.updateYGN(_ygn);
    }
}
