// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IUniversalOneSidedFarm {
    function poolLiquidity(
        address _userAddress,
        address _fromToken,
        uint256 _fromTokenAmount,
        address _pairAddress,
        address _toToken,
        uint256 _slippageAdjustedMinLP
    ) external payable returns (uint256);
}
