// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const PenroseStrategyParams = require("../penrose_strategy_params.json");

async function main() {
  const PenroseFinanceStrategy = await hre.ethers.getContractFactory("PenroseFinanceStrategy");
  const penroseStrategyInstance = await PenroseFinanceStrategy.deploy(
    PenroseStrategyParams.asset,
    PenroseStrategyParams.rewardTokenA,
    PenroseStrategyParams.rewardTokenB,
    PenroseStrategyParams.userProxyInterfaceContract,
    PenroseStrategyParams.ygnConverter,
    PenroseStrategyParams.treasury,
    PenroseStrategyParams.farm,
    PenroseStrategyParams.dystRouter
  );
  await penroseStrategyInstance.deployed();
  console.log("QuickSwap Dragon Strategy deployed at " + penroseStrategyInstance.address);
  await penroseStrategyInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: penroseStrategyInstance.address,
    constructorArguments: [
      PenroseStrategyParams.asset,
      PenroseStrategyParams.rewardTokenA,
      PenroseStrategyParams.rewardTokenB,
      PenroseStrategyParams.userProxyInterfaceContract,
      PenroseStrategyParams.ygnConverter,
      PenroseStrategyParams.treasury,
      PenroseStrategyParams.farm,
      PenroseStrategyParams.dystRouter,
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
