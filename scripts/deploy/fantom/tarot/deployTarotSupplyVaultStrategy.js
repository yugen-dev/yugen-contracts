// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("./constructor_params.json");

async function main() {
  const TarotSupplyVaultStrategy = await hre.ethers.getContractFactory("TarotSupplyVaultStrategy");
  const tarotSupplyVaultStrategyInstance = await TarotSupplyVaultStrategy.deploy(
    ConstructorParams.FTM.asset,
    ConstructorParams.FTM.supplyVault,
    ConstructorParams.supplyVaultRouter,
    ConstructorParams.ygnConverter,
    ConstructorParams.farm
  );
  await tarotSupplyVaultStrategyInstance.deployed();
  console.log(
    "Tarot Supply Vault Strategy deployed at " + tarotSupplyVaultStrategyInstance.address
  );
  await tarotSupplyVaultStrategyInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: tarotSupplyVaultStrategyInstance.address,
    constructorArguments: [
      ConstructorParams.FTM.asset,
      ConstructorParams.FTM.supplyVault,
      ConstructorParams.supplyVaultRouter,
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
