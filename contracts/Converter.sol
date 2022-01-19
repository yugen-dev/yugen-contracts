// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IUniswapV2Factory.sol";
import "interfaces/IUniswapV2Router.sol";

// Converter is Yugen Farm's left hand and kinda a wizard. He can create up YGN from pretty much anything!
// This contract handles "serving up" the Yugen farm with YGNs which is then distributed as rewards.
// This contract differs in the way from its predecessor by using the Router/Factory specific to the exchange to swap tokens to YGN.

contract Converter is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // The YGN TOKEN!
    IERC20 public ygn;

    address public fYGNBurner;
    uint16 public burnerAllocation;

    address public ygnStaker;
    uint16 public stakersAllocation;

    address public platformAddr;
    uint16 public platformFeesAllocation;

    address public treasury;
    uint16 public treasuryAllocation;

    event YGNConverted(
        uint256 burnerAllocated,
        uint256 stakersAllocated,
        uint256 platformFees,
        uint256 treasuryAllocated
    );

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    modifier ensureValidRouter(IUniswapV2Router router) {
        require(address(router) != address(0), "No zero address");
        require(
            address(IUniswapV2Factory(router.factory())) != address(0),
            "Invalid Factory address"
        );
        _;
    }

    constructor(
        IERC20 _ygn,
        address _fYGNBurner,
        uint16 _burnerAllocation,
        address _ygnStaker,
        uint16 _stakersAllocation,
        address _platformAddr,
        uint16 _platformFeesAllocation,
        address _treasury,
        uint16 _treasuryAllocation
    ) {
        ygn = _ygn;
        fYGNBurner = _fYGNBurner;
        ygnStaker = _ygnStaker;
        platformAddr = _platformAddr;
        treasury = _treasury;
        setAllocation(
            _burnerAllocation,
            _stakersAllocation,
            _platformFeesAllocation,
            _treasuryAllocation
        );
    }

    // Set the allocation to handle accumulated swap fees
    function setAllocation(
        uint16 _burnerAllocation,
        uint16 _stakersAllocation,
        uint16 _platformFeesAllocation,
        uint16 _treasuryAllocation
    ) public onlyOwner {
        require(
            _burnerAllocation +
                _stakersAllocation +
                _platformFeesAllocation +
                _treasuryAllocation ==
                1000,
            "invalid allocations"
        );
        burnerAllocation = _burnerAllocation;
        stakersAllocation = _stakersAllocation;
        platformFeesAllocation = _platformFeesAllocation;
        treasuryAllocation = _treasuryAllocation;
    }

    // Can be used by the owner to update the fYGN burner
    function updatefYGNBurner(address _fYGNBurner)
        external
        onlyOwner
        ensureNonZeroAddress(_fYGNBurner)
    {
        fYGNBurner = _fYGNBurner;
    }

    // Can be used by the owner to update the address for the YGNStaker
    function updateYGNStaker(address _newYGNStaker)
        external
        onlyOwner
        ensureNonZeroAddress(_newYGNStaker)
    {
        ygnStaker = _newYGNStaker;
    }

    // Can be used by the owner to update the platformAddress
    function updatePlatformAddress(address _platformAddr)
        external
        onlyOwner
        ensureNonZeroAddress(_platformAddr)
    {
        platformAddr = _platformAddr;
    }

    // Can be used by the owner to update the address for the treasury
    function updateTreasury(address _treasury) external onlyOwner ensureNonZeroAddress(_treasury) {
        treasury = _treasury;
    }

    /**
    @notice convertChildToken is used to convert child tokens received by the converter contract to the token provided in the path.
    @param token The token address to swap from.
    @param path The path to take for the token swap
    @param router The router contract to be used for the token swap
    */
    function convertChildToken(
        address token,
        address[] calldata path,
        IUniswapV2Router router
    ) external onlyOwner nonReentrant ensureNonZeroAddress(token) ensureValidRouter(router) {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        _swapToken(token, path, router);
    }

    /**
    @notice convertToYGN is used to convert tokens received by the converter contract to YGN.
    It uses the Router to convert the ERC20 tokens to YGN. The YGN accumulated is used to allocate to different contracts as per their allocation share.
    @param token The token address to swap from.
    @param path The path to take for the token swap
    @param router The router contract to be used for the token swap
    */
    function convertToYGN(
        address token,
        address[] calldata path,
        IUniswapV2Router router
    ) external onlyOwner nonReentrant ensureNonZeroAddress(token) ensureValidRouter(router) {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        require(token != address(ygn), "Token Address should not be YGN");
        require(path[path.length - 1] == address(ygn), "Token should only be swapped to YGN");
        _swapToken(token, path, router);
        _allocateYGN();
    }

    /**
    @notice This function is used to swap ERC20 <> ERC20
    @param token The token address to swap from.
    @param path The path to take for the token swap
    @param router The router contract to be used for the token swap
    */
    function _swapToken(
        address token,
        address[] calldata path,
        IUniswapV2Router router
    ) internal {
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        require(tokenBalance > 0, "Contract should have token balance greater than 0");
        IERC20(token).safeApprove(address(router), 0);
        IERC20(token).safeApprove(address(router), tokenBalance);

        uint256 swappedAmount = router.swapExactTokensForTokens(
            tokenBalance,
            1,
            path,
            address(this),
            block.timestamp + 1
        )[path.length - 1];

        require(swappedAmount > 0, "Error in Swapping Tokens");
    }

    /*
    Internal method used by the converter to allocate swapped/converted YGN 
    to different contracts as per their allocation share.
    */
    function _allocateYGN() internal {
        uint256 totalYGNAccumulated = IERC20(ygn).balanceOf(address(this));
        require(totalYGNAccumulated > 0, "No YGN accumulated to allocate");
        _safeTransfer(
            address(ygn),
            fYGNBurner,
            totalYGNAccumulated.mul(burnerAllocation).div(1000)
        );
        _safeTransfer(
            address(ygn),
            ygnStaker,
            totalYGNAccumulated.mul(stakersAllocation).div(1000)
        );
        _safeTransfer(
            address(ygn),
            platformAddr,
            totalYGNAccumulated.mul(platformFeesAllocation).div(1000)
        );
        _safeTransfer(
            address(ygn),
            treasury,
            totalYGNAccumulated.mul(treasuryAllocation).div(1000)
        );
        emit YGNConverted(
            totalYGNAccumulated.mul(burnerAllocation).div(1000),
            totalYGNAccumulated.mul(stakersAllocation).div(1000),
            totalYGNAccumulated.mul(platformFeesAllocation).div(1000),
            totalYGNAccumulated.mul(treasuryAllocation).div(1000)
        );
    }

    // Wrapper for safeTransfer
    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        IERC20(token).safeTransfer(to, amount);
    }

    function rescueFunds(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        IERC20(token).safeTransfer(owner(), balance);
    }
}
