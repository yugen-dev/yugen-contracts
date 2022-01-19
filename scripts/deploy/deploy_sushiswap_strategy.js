// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const SushiSwapStrategyParams = require("../sushi_swap_farms_strategy.json");

async function main() {
  const SushiSwapFarmsStrategy = await hre.ethers.getContractFactory("SushiSwapFarmsStrategy");
  this.sushiSwapFarmsStrategyInstance = await SushiSwapFarmsStrategy.deploy(
    SushiSwapStrategyParams.asset,
    SushiSwapStrategyParams.rewardToken,
    SushiSwapStrategyParams.wmatic,
    SushiSwapStrategyParams.miniChefContract,
    SushiSwapStrategyParams.ygnConverter,
    SushiSwapStrategyParams.farm,
    SushiSwapStrategyParams.pid
  );
  await this.sushiSwapFarmsStrategyInstance.deployed();

  console.log("SushiSwap Strategy deployed at " + sushiSwapFarmsStrategyInstance.address);
  await sushiSwapFarmsStrategyInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: sushiSwapFarmsStrategyInstance.address,
    constructorArguments: [
      SushiSwapStrategyParams.asset,
      SushiSwapStrategyParams.rewardToken,
      SushiSwapStrategyParams.wmatic,
      SushiSwapStrategyParams.miniChefContract,
      SushiSwapStrategyParams.ygnConverter,
      SushiSwapStrategyParams.farm,
      SushiSwapStrategyParams.pid,
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
