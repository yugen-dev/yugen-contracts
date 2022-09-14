// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "./IRoute.sol";

interface IUniversalSingleSidedLiquidity is IRoute {
    function poolLiquidityUniswapV2(
        address _userAddress,
        address _fromToken,
        uint256 _fromTokenAmount,
        address _pairAddress,
        address _toToken,
        uint256 _slippageAdjustedMinLP,
        address[] memory _swapPathForToToken
    ) external payable returns (uint256 lpBought);

    function poolLiquidityDystopia(
        address _userAddress,
        address _fromToken,
        uint256 _fromTokenAmount,
        address _pairAddress,
        address _toToken,
        uint256 _slippageAdjustedMinLP,
        Route[] calldata _swapPathForToToken
    ) external payable returns (uint256 lpBought);
}
