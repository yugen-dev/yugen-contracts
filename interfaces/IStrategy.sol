// SPDX-License-Identifier: agpl-3.0
pragma solidity >=0.6.0 <0.8.0;

interface IStrategy {
    function deposit(address token, uint256 amount) external returns (uint256 depositedAmount);

    function withdraw(address token, uint256 amount) external returns (uint256 withdrawnAmount);

    function strategyDepositFeeBP() external view returns (uint256);

    function strategyWithdrawalFeeBP() external view returns (uint256);

    function rescueFunds(address _token) external returns (uint256 rescuedAssetAmount);

    function totalInputTokensStaked() external view returns (uint256);

    function switchStrategy(IStrategy _strategy) external;

    function updateLiquidityHolder(address _liquidityHolder, bool _status) external;

    function updateStrategyMode(bool _isStrategyEnabled) external;

    function updateSupportsEmergencyWithdraw(bool _supportsEmergencyWithdraw) external;
}
