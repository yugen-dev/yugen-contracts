// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../dyst_converter.json");

async function main() {
  const DystConverter = await hre.ethers.getContractFactory("DystConverter");
  const dystConverterInstance = await DystConverter.deploy(
    ConstructorParams.usdc,
    ConstructorParams.ygnConverter
  );
  await dystConverterInstance.deployed();
  console.log("DystConverter deployed at " + dystConverterInstance.address);
  await dystConverterInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: dystConverterInstance.address,
    constructorArguments: [ConstructorParams.usdc, ConstructorParams.ygnConverter],
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
