// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

interface IMasterChef {
    function userInfo(uint256 _pid, address _user) external view returns (uint256, uint256);

    function deposit(uint256 _pid, uint256 _amount) external;

    function withdraw(uint256 _pid, uint256 _amount) external;

    function pendingShare(uint256 _pid, address _user) external view returns (uint256);

    // only for Cafeswap
    function pendingBrew(uint256 _pid, address _user) external view returns (uint256);

    function emergencyWithdraw(uint256 _pid) external;
}
