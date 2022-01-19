// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./YGNStaker.sol";

contract FYGNClaimableBurner is Ownable {
    using SafeMath for uint256;

    ERC20Burnable public fYGNToken;

    IERC20 public ygnToken;

    YGNStaker public ygnStaker;

    constructor(
        ERC20Burnable _fYGN,
        IERC20 _ygnToken,
        YGNStaker _ygnStaker
    ) {
        fYGNToken = _fYGN;
        ygnToken = _ygnToken;
        ygnStaker = _ygnStaker;
    }

    function updateYGNStaker(YGNStaker _ygnStaker) external onlyOwner {
        ygnStaker = _ygnStaker;
    }

    function updateYGN(IERC20 _ygnToken) external onlyOwner {
        ygnToken = _ygnToken;
    }

    function updateFYGN(ERC20Burnable _fYGNToken) external onlyOwner {
        fYGNToken = _fYGNToken;
    }

    function getYGNAmount(uint256 _fYGNShare) public view returns (uint256) {
        uint256 totalSupply = fYGNToken.totalSupply();
        if (totalSupply == 0) {
            return 0;
        }
        return _fYGNShare.mul(ygnToken.balanceOf((address(this)))).div(totalSupply);
    }

    function burnFYGNFor(address _account, uint256 _fYGNShare) external {
        leaveInternal(_account, _fYGNShare);
    }

    function burnAndStake(uint256 _fYGNShare) external {
        fYGNToken.transferFrom(msg.sender, address(this), _fYGNShare);
        uint256 ygnAmount = getYGNAmount(_fYGNShare);

        fYGNToken.burn(_fYGNShare);

        ygnToken.approve(address(ygnStaker), ygnAmount);
        ygnStaker.enterFor(msg.sender, ygnAmount);
    }

    function leaveInternal(address _account, uint256 _fYGNShare) internal {
        fYGNToken.transferFrom(msg.sender, address(this), _fYGNShare);

        uint256 ygnAmount = getYGNAmount(_fYGNShare);

        ygnToken.transfer(_account, ygnAmount);

        fYGNToken.burn(_fYGNShare);
    }

    function leave(uint256 _fYGNShare) public {
        leaveInternal(msg.sender, _fYGNShare);
    }
}
