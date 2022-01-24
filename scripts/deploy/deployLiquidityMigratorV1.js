const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json").liquidityMigratorV1;

async function main() {
  // We get the contract to deploy
  const LiquidityMigratorV1 = await hre.ethers.getContractFactory("LiquidityMigratorV1");

  const liquidityMigratorV1 = await LiquidityMigratorV1.deploy(
    ConstructorParams.farm,
    ConstructorParams.rewardManager,
    ConstructorParams.fYGN
  );

  await liquidityMigratorV1.deployed();

  console.log("LiquidityMigratorV1 deployed at:", liquidityMigratorV1.address);

  await liquidityMigratorV1.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: liquidityMigratorV1.address,
    constructorArguments: [
      ConstructorParams.farm,
      ConstructorParams.rewardManager,
      ConstructorParams.fYGN,
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
