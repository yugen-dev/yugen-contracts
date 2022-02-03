// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("./constructor_params.json");

async function main() {
  const FTMWrapper = await hre.ethers.getContractFactory("FTMWrapper");
  const ftmWrapperInstance = await FTMWrapper.deploy(
    ConstructorParams.farm,
    ConstructorParams.wrappedToken
  );
  await ftmWrapperInstance.deployed();
  console.log("FTM Wrapper deployed at " + ftmWrapperInstance.address);
  await ftmWrapperInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: ftmWrapperInstance.address,
    constructorArguments: [ConstructorParams.farm, ConstructorParams.wrappedToken],
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
