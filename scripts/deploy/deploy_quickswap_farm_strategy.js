// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const QuickSwapStrategyParams = require("../quick_swap_farms_strategy.json");

async function main() {
  const QuickSwapFarmsStrategy = await hre.ethers.getContractFactory("QuickSwapFarmsStrategy");
  const quickSwapFarmsStrategyInstance = await QuickSwapFarmsStrategy.deploy(
    QuickSwapStrategyParams.asset,
    QuickSwapStrategyParams.rewardToken,
    QuickSwapStrategyParams.stakingRewardsContract,
    QuickSwapStrategyParams.ygnConverter,
    QuickSwapStrategyParams.farm,
    QuickSwapStrategyParams.quickTokenAddress
  );
  await quickSwapFarmsStrategyInstance.deployed();
  console.log("QuickSwapDualFarmsDual deployed at " + quickSwapFarmsStrategyInstance.address);
  await quickSwapFarmsStrategyInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: quickSwapFarmsStrategyInstance.address,
    constructorArguments: [
      QuickSwapStrategyParams.asset,
      QuickSwapStrategyParams.rewardToken,
      QuickSwapStrategyParams.stakingRewardsContract,
      QuickSwapStrategyParams.ygnConverter,
      QuickSwapStrategyParams.farm,
      QuickSwapStrategyParams.quickTokenAddress,
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
