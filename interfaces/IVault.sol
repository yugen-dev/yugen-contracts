//SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC20Detailed is IERC20 {
    function decimals() external view returns (uint8);
}

interface IVault {
    function underlying() external view returns (IERC20Detailed);

    function target() external view returns (IERC20);

    function distribution() external view returns (address);

    function strat() external view returns (address);

    function timelock() external view returns (address payable);

    function balanceOf(address) external view returns (uint256);

    function calcTotalValue() external view returns (uint256);

    function changePerformanceFee(uint256 fee) external;

    function claim() external returns (uint256 claimed);

    function unclaimedProfit(address user) external view returns (uint256);

    function pending(address user) external view returns (uint256);
}
