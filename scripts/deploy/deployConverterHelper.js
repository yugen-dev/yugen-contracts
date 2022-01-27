const hre = require("hardhat");

async function main() {
  // We get the contract to deploy
  const UniversalConverterHelper = await hre.ethers.getContractFactory("UniversalConverterHelper");

  const converterHelperInstance = await UniversalConverterHelper.deploy();

  await converterHelperInstance.deployed();

  console.log("UniversalConverterHelper deployed at:", converterHelperInstance.address);

  await converterHelperInstance.deployTransaction.wait([(confirms = 6)]);

  //Exisitng strategies for yugen
  const strategies = [
    "0x9634A9317CcbBb9c5da79311AE337845d13ff6C7",
    "0x7B0b73E1873A911d76cbc04881e61B7B4627266b",
    "0x29406DD389334dbBF23966fdd903c6De932e112C",
    "0xE7A88111269875FE5793A1831C22197422CfC604",
    "0x261f779419016b86BA8e663a4Eb73b39CB4F813b",
    "0xf0d9b1A785f729901F9697F89dF5E4079dF0f730",
    "0x017AE400cd59E47608eE77241E7143a668Cf8DdC",
    "0x77d2286b79AC8D6615e5dfeCde33570017444F3f",
    "0x126219afdea0b3b750A58822e71F2271a73E0822",
    "0x4585A780F83d81f5A31fd5e07328ac53df54e2D5",
    "0x50EF226fFB852Fb34fF6367E2Fc9730f11Cce1EB",
  ];
  await converterHelperInstance.addStrategies(strategies);

  console.log("transaction successful, Strategies added");

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
