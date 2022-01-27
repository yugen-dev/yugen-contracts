// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IStrategy.sol";

contract UniversalConverterHelper is Ownable, ReentrancyGuard {
    using Address for address;

    struct StrategyInfo {
        IStrategy strategy; // Address of the strategy contract.
        bool isActive;
    }

    StrategyInfo[] public strategyInfo;
    mapping(IStrategy => uint256) public strategyIndexes;

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    modifier validateStrategy(IStrategy strategy) {
        require(
            strategyIndexes[strategy] < strategyInfo.length && strategyIndexes[strategy] > 0,
            "Strategy Address does not exist"
        );
        _;
    }

    constructor() {
        strategyInfo.push(StrategyInfo({strategy: IStrategy(address(0)), isActive: false}));
    }

    //Only Owner Functions

    function addStrategies(IStrategy[] calldata _strategies) external onlyOwner {
        for (uint256 i = 0; i < _strategies.length; i++) {
            require(address(_strategies[i]) != address(0), "No zero address");
            require(strategyIndexes[_strategies[i]] == 0, "Strategy Already Added");
            strategyIndexes[_strategies[i]] = strategyInfo.length;
            strategyInfo.push(StrategyInfo({strategy: _strategies[i], isActive: true}));
        }
    }

    //Make sure these strategies have updatePool method
    function addStrategy(IStrategy _strategy)
        external
        onlyOwner
        ensureNonZeroAddress(address(_strategy))
    {
        require(strategyIndexes[_strategy] == 0, "Strategy Already Added");

        strategyIndexes[_strategy] = strategyInfo.length;
        strategyInfo.push(StrategyInfo({strategy: _strategy, isActive: true}));
    }

    function updateStrategyStatus(IStrategy _strategy, bool _isActive)
        external
        onlyOwner
        ensureNonZeroAddress(address(_strategy))
        validateStrategy(_strategy)
    {
        StrategyInfo storage strategyDetails = strategyInfo[strategyIndexes[_strategy]];
        strategyDetails.isActive = _isActive;
    }

    //View Functions

    function totalStrategies() external view returns (uint256) {
        return strategyInfo.length;
    }

    //Public Functions

    //Call update pool for any strategy not added (can be a temporary measure) (Shouldn't be used)
    function updatePools(IStrategy[] calldata _strategies) external nonReentrant {
        for (uint256 i = 0; i < _strategies.length; i++) {
            require(address(_strategies[i]) != address(0), "No zero address");
            _strategies[i].updatePool();
        }
    }

    //Calls update pool for all stratgies added
    function updatePoolForAllStrategies() external nonReentrant {
        for (uint256 i = 1; i < strategyInfo.length; i++) {
            StrategyInfo storage strategyDetails = strategyInfo[i];
            if (strategyDetails.isActive) {
                strategyDetails.strategy.updatePool();
            }
        }
    }
}
