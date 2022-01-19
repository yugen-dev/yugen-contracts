// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../fygn_config.json");

async function main() {
  const FYGN = await hre.ethers.getContractFactory("FYGN");
  const fYGNInstance = await FYGN.deploy(
    ConstructorParams.name,
    ConstructorParams.symbol
  );
  await fYGNInstance.deployed();
  console.log("FYGN deployed at " + fYGNInstance.address);
  await fYGNInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: fYGNInstance.address,
    constructorArguments: [
      ConstructorParams.name,
      ConstructorParams.symbol
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
