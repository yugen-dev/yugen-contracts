// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "../interfaces/IFarm.sol";
import "interfaces/IUniswapV2ERC20.sol";
import "interfaces/IUniswapV2Router.sol";
import "interfaces/IUniversalOneSidedFarm.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./libraries/TransferHelper.sol";

contract FarmWrapper {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IFarm public farm;
    IUniswapV2ERC20 public nachoLP;
    IUniswapV2Router public quickSwapRouter;
    address public secondaryToken;
    IERC20 public token;
    IUniversalOneSidedFarm public universalOneSidedFarm;

    constructor(
        IUniversalOneSidedFarm _universalOneSidedFarm,
        IUniswapV2ERC20 _nachoLP, // WETH-NACHO
        IUniswapV2Router _quickSwapRouter,
        IERC20 _token,
        address _secondaryToken,
        IFarm _farm
    ) public {
        universalOneSidedFarm = _universalOneSidedFarm;
        nachoLP = _nachoLP;
        quickSwapRouter = _quickSwapRouter;
        token = _token;
        secondaryToken = _secondaryToken;
        farm = _farm;
    }

    function deposit(
        uint256 _pid,
        uint256 _amount,
        bool _userWantsToStake
    ) external {
        uint256 lpsReceived;
        if (_amount > 0) {
            TransferHelper.safeTransferFrom(address(token), msg.sender, address(this), _amount);

            // Convert to WETH-NACHO strategy
            token.safeApprove(address(universalOneSidedFarm), _amount);
            lpsReceived = universalOneSidedFarm.poolLiquidity(
                address(this),
                address(token),
                _amount,
                address(nachoLP),
                address(token),
                1
            );
            require(lpsReceived > 0, "Error in providing liquidity");
        }

        IERC20(address(nachoLP)).safeApprove(address(farm), lpsReceived);
        farm.depositFor(_pid, lpsReceived, msg.sender, _userWantsToStake);

        uint256 leftOvertoken = IERC20(token).balanceOf(address(this));
        if (leftOvertoken > 0) {
            IERC20(token).transfer(msg.sender, leftOvertoken);
        }
        uint256 leftOverSecondaryToken = IERC20(secondaryToken).balanceOf(address(this));
        if (leftOverSecondaryToken > 0) {
            IERC20(token).transfer(msg.sender, leftOverSecondaryToken);
        }
    }
}
