// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

//whcih blockchain ??
async function main() {
  const MasterChef = await hre.ethers.getContractFactory("MasterChef");
  const farmInstance = await MasterChef.deploy(
    ConstructorParams.MASTERCHEF_TOKEN,
    ConstructorParams.CHILD_FARM_FEE_ADDRESS,
    ConstructorParams.CHILD_FARM_FEE_ADDRESS,
    ConstructorParams.START_BLOCK
  );
  await farmInstance.deployed();
  console.log("MasterChef deployed at " + farmInstance.address);
  await farmInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: farmInstance.address,
    constructorArguments: [
      ConstructorParams.MASTERCHEF_TOKEN,
      ConstructorParams.CHILD_FARM_FEE_ADDRESS,
      ConstructorParams.CHILD_FARM_FEE_ADDRESS,
      ConstructorParams.START_BLOCK,
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
