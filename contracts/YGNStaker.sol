// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/NativeMetaTransaction.sol";
import "./libraries/ContextMixin.sol";

// YGNStaker is the coolest staker in defi space. You come in with some YGN, and leave with more! The longer you stay, the more YGN you get.

// This contract handles swapping to and from xYGN
contract YGNStaker is ERC20("YGNStaker", "xYGN"), ContextMixin, NativeMetaTransaction, Ownable {
    using SafeMath for uint256;
    IERC20 public ygn;

    // Define the YGN token contract
    constructor(IERC20 _ygn) {
        _initializeEIP712("YGNStaker");
        ygn = _ygn;
    }

    function updateYGN(IERC20 _ygn) external onlyOwner {
        ygn = _ygn;
    }

    function _msgSender() internal view override returns (address payable sender) {
        return ContextMixin.msgSender();
    }

    function getXYGNAmount(uint256 _ygnAmount) public view returns (uint256 xYGNAmount) {
        // Gets the amount of YGN locked in the contract
        uint256 totalYGN = ygn.balanceOf(address(this));
        // Gets the amount of xYGN in existence
        uint256 totalShares = totalSupply();
        // If no xYGN exists, return amount
        if (totalShares == 0 || totalYGN == 0) {
            xYGNAmount = _ygnAmount;
        }
        // Calculate the amount of xYGN the YGN is worth. The ratio will change overtime, as xYGN is burned/minted and YGN deposited + gained from fees / withdrawn.
        else {
            xYGNAmount = _ygnAmount.mul(totalShares).div(totalYGN);
        }
    }

    function enterFor(address _account, uint256 _amount) external {
        enterInternal(_account, _amount);
    }

    function enter(uint256 _amount) external {
        enterInternal(msg.sender, _amount);
    }

    function enterInternal(address _account, uint256 _amount) internal {
        // Gets the amount of YGN locked in the contract
        uint256 totalYGN = ygn.balanceOf(address(this));
        // Gets the amount of xYGN in existence
        uint256 totalShares = totalSupply();
        // If no xYGN exists, mint it 1:1 to the amount put in
        if (totalShares == 0 || totalYGN == 0) {
            _mint(_account, _amount);
        }
        // Calculate and mint the amount of xYGN the YGN is worth. The ratio will change overtime, as xYGN is burned/minted and YGN deposited + gained from fees / withdrawn.
        else {
            uint256 what = _amount.mul(totalShares).div(totalYGN);
            _mint(_account, what);
        }
        // Lock the YGN in the contract
        require(ygn.transferFrom(_msgSender(), address(this), _amount), "Transfer of YGN failed");
    }

    // Leave the staker. Claim back your YGNs.
    // Unlocks the staked + gained YGN and burns xYGN
    function leave(uint256 _share) external {
        // Gets the amount of xYGN in existence
        uint256 totalShares = totalSupply();
        // Calculates the amount of YGN the xYGN is worth
        uint256 what = _share.mul(ygn.balanceOf(address(this))).div(totalShares);
        _burn(_msgSender(), _share);
        require(ygn.transfer(_msgSender(), what), "Transfer of YGN failed");
    }
}
