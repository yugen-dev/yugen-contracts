// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../nacho_xyz_eth_strategy.json");

async function main() {
  const NachoXYZStrategy = await hre.ethers.getContractFactory("NachoXYZStrategy");
  const nachoXYZStrategyInstance = await NachoXYZStrategy.deploy(
    ConstructorParams.nachoLP,
    ConstructorParams.rewardToken,
    ConstructorParams.masterChefContract,
    ConstructorParams.ygnConverter,
    ConstructorParams.farm,
    ConstructorParams.pid
  );
  await nachoXYZStrategyInstance.deployed();
  console.log("Nacho strategy deployed at " + nachoXYZStrategyInstance.address);
  await nachoXYZStrategyInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: nachoXYZStrategyInstance.address,
    contract: "NachoXYZStrategy",
    constructorArguments: [
      ConstructorParams.nachoLP,
      ConstructorParams.rewardToken,
      ConstructorParams.masterChefContract,
      ConstructorParams.ygnConverter,
      ConstructorParams.farm,
      ConstructorParams.pid
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
