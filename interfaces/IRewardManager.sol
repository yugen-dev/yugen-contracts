// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "./IFYGNClaimableBurner.sol";
import "./IYGNStaker.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";

interface IRewardManager {
    event Vested(address indexed _beneficiary, uint256 indexed value);

    event DrawDown(address indexed _beneficiary, uint256 indexed _amount, uint256 indexed bonus);

    event PreMatureDrawn(
        address indexed _beneficiary,
        uint256 indexed burntAmount,
        uint256 indexed userEffectiveWithdrawn
    );

    function startDistribution() external view returns (uint256);

    function endDistribution() external view returns (uint256);

    function updatePreMaturePenalty(uint256 _newpreMaturePenalty) external;

    function updateBonusPercentage(uint256 _newBonusPercentage) external;

    function updateDistributionTime(uint256 _updatedStartTime, uint256 _updatedEndTime) external;

    function updateUpfrontUnlock(uint256 _newUpfrontUnlock) external;

    function updateWhitelistAddress(address _excludeAddress, bool status) external;

    // Can be used by the owner to update the address for the FYGNClaimableBurner
    function updateFYGNClaimableBurner(IFYGNClaimableBurner _fYGNClaimableBurner) external;

    // Can be used by the owner to update the address for the YGNStaker
    function updateYGNStaker(IYGNStaker _ygnStaker) external;

    function updateFYGN(ERC20Burnable _fYGN) external;

    function updateYGN(IERC20 _ygn) external;

    function handleRewardsForUser(
        address _user,
        uint256 _rewardAmount,
        bool _userWantsToStake
    ) external;

    function vestingInfo(address _user)
        external
        view
        returns (
            uint256 totalVested,
            uint256 totalDrawnAmount,
            uint256 amountBurnt,
            uint256 claimable,
            uint256 bonusRewards,
            uint256 stillDue
        );

    function drawDown(address _user, bool _userWantsToStake) external;

    function preMatureDraw(address _beneficiary, bool _userWantsToStake) external;

    function addBonusRewards(uint256 _bonusRewards) external;

    function removeBonusRewards(address _owner) external;
}
