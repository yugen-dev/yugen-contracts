// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IFarm.sol";
import "interfaces/IWRAP.sol";
import "./libraries/TransferHelper.sol";

contract FTMWrapper is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    IFarm public farm;
    IWRAP public wrappedToken;

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    /**
     * @notice Creates a new FTMWrapper Contract
     * @param _farm Farm Address used by wrapper to deposit into farm
     * @param _wrappedToken wrapped token which can be WFTM wtc.
     * @dev deployer of contract is set as owner
     */
    constructor(IFarm _farm, IWRAP _wrappedToken) {
        farm = _farm;
        wrappedToken = _wrappedToken;
    }

    /**
     * @notice function to deposit native asset to Farms.
     * @param _pid Pid of the farm pool to deposit in.
     * @param _amount Ammount of FTM that needs to be deposited
     * @param _userWantsToStake bool flag for user's harvest rewards
     * @dev Called by the frotend to deposit FTM as WFTM in the farms
     */
    function depositToFarm(
        uint256 _pid,
        uint256 _amount,
        bool _userWantsToStake
    ) external payable nonReentrant {
        require(msg.value > 0 && msg.value == _amount, "msg.value should be greater than zero");
        uint256 beforeDepositWrappedTokenBalance = IERC20(address(wrappedToken)).balanceOf(
            address(this)
        );
        IWRAP(wrappedToken).deposit{value: msg.value}();
        uint256 afterDepositWrappedTokenBalance = IERC20(address(wrappedToken)).balanceOf(
            address(this)
        );
        assert(afterDepositWrappedTokenBalance.sub(beforeDepositWrappedTokenBalance) == msg.value);
        TransferHelper.safeApprove(address(wrappedToken), address(farm), _amount);
        farm.depositFor(_pid, _amount, msg.sender, _userWantsToStake);
    }

    /**
     * @notice Updates the Farm Address
     * @param _farm Address of the farm
     * @dev Only owner can call and update the farm address
     */
    function updateFarmAddress(IFarm _farm)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_farm))
    {
        farm = _farm;
    }

    /**
     * @notice Updates the wrapped token Address.
     * @param _wrappedToken Address of the wrapped token
     * @dev Only owner can call and update the wrapped token address. This should be rarely used and only if there is an oncrrect wrapped token address
     */
    function updateWrappedToken(IWRAP _wrappedToken)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(address(_wrappedToken))
    {
        wrappedToken = _wrappedToken;
    }

    /**
     * @notice Rescue any tokens that have not been able to processed by the contract
     * @param _token Address of the token to be rescued
     */
    function rescueFunds(address _token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        TransferHelper.safeTransfer(_token, owner(), balance);
    }
}
