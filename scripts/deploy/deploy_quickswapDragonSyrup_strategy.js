// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const QuickSwapDragonStrategyParams = require("../quick_swap_dragon_syrup_strategy.json");

async function main() {
  const QuickSwapDragonSyrupStrategy = await hre.ethers.getContractFactory(
    "QuickSwapDragonSyrupStrategy"
  );
  const quickSwapDragonStrategyInstance = await QuickSwapDragonSyrupStrategy.deploy(
    QuickSwapDragonStrategyParams.asset,
    QuickSwapDragonStrategyParams.rewardToken,
    QuickSwapDragonStrategyParams.stakingRewardsContract,
    QuickSwapDragonStrategyParams.ygnConverter,
    QuickSwapDragonStrategyParams.farm
  );
  await quickSwapDragonStrategyInstance.deployed();
  console.log("QuickSwap Dragon Strategy deployed at " + quickSwapDragonStrategyInstance.address);
  await quickSwapDragonStrategyInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: quickSwapDragonStrategyInstance.address,
    constructorArguments: [
      QuickSwapDragonStrategyParams.asset,
      QuickSwapDragonStrategyParams.rewardToken,
      QuickSwapDragonStrategyParams.stakingRewardsContract,
      QuickSwapDragonStrategyParams.ygnConverter,
      QuickSwapDragonStrategyParams.farm,
    ],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
