// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

interface IFYGNClaimableBurner {
    function getYGNAmount(uint256 _fYGNShare) external view returns (uint256);

    function burnFYGNFor(address _account, uint256 _fYGNShare) external;

    function burnAndStake(uint256 _fYGNShare) external;

    function leave(uint256 _fYGNShare) external;
}
