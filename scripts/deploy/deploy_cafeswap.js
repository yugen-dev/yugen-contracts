// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../cafeswap_strategy.json");

async function main() {
  const CafeSwapStrategy = await hre.ethers.getContractFactory("CafeSwapStrategy");
  const cafeSwapStrategyDualInstance = await CafeSwapStrategy.deploy(
    ConstructorParams.asset,
    ConstructorParams.rewardToken,
    ConstructorParams.masterChefContract,
    ConstructorParams.ygnConverter,
    ConstructorParams.farm,
    ConstructorParams.pid
  );
  await cafeSwapStrategyDualInstance.deployed();
  console.log("CafeSwap Strategy deployed at " + cafeSwapStrategyDualInstance.address);
  await cafeSwapStrategyDualInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: cafeSwapStrategyDualInstance.address,
    constructorArguments: [
      ConstructorParams.asset,
      ConstructorParams.rewardToken,
      ConstructorParams.masterChefContract,
      ConstructorParams.ygnConverter,
      ConstructorParams.farm,
      ConstructorParams.pid,
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
