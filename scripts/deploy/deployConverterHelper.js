const hre = require("hardhat");

async function main() {
  // We get the contract to deploy
  const UniversalConverterHelper = await hre.ethers.getContractFactory("UniversalConverterHelper");

  const converterHelperInstance = await UniversalConverterHelper.deploy();

  await converterHelperInstance.deployed();

  console.log("UniversalConverterHelper deployed at:", converterHelperInstance.address);

  await converterHelperInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: converterHelperInstance.address,
    constructorArguments: [],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
