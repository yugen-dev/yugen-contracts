// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IYGNStaker {
    function ygn() external view returns (IERC20);

    function getXYGNAmount(uint256 _ygnAmount) external view returns (uint256 xYGNAmount);

    function enterFor(address _account, uint256 _amount) external;

    function enter(uint256 _amount) external;

    function leave(uint256 _share) external;
}
