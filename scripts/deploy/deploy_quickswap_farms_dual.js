// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../quick_swap_farms_dual_strategy.json");

async function main() {
  const QuickSwapFarmsStrategyDual = await hre.ethers.getContractFactory("QuickSwapFarmsStrategyDual");
  const quickSwapFarmsStrategyDualInstance = await QuickSwapFarmsStrategyDual.deploy(
    ConstructorParams.asset,
    ConstructorParams.rewardTokenA,
    ConstructorParams.rewardTokenB,
    ConstructorParams.quickTokenAddress,
    ConstructorParams.stakingRewardsContract,
    ConstructorParams.ygnConverter,
    ConstructorParams.farm,
  );
  await quickSwapFarmsStrategyDualInstance.deployed();
  console.log("QuickSwapDualFarmsDual deployed at " + quickSwapFarmsStrategyDualInstance.address);
  await quickSwapFarmsStrategyDualInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: quickSwapFarmsStrategyDualInstance.address,
    constructorArguments: [
      ConstructorParams.asset,
      ConstructorParams.rewardTokenA,
      ConstructorParams.rewardTokenB,
      ConstructorParams.quickTokenAddress,
      ConstructorParams.stakingRewardsContract,
      ConstructorParams.ygnConverter,
      ConstructorParams.farm,
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