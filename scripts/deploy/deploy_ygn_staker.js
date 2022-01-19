// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../ygn_staker_config.json");

async function main() {
  const YGNStaker = await hre.ethers.getContractFactory("YGNStaker");
  const ygnInstance = await YGNStaker.deploy(
    ConstructorParams.ygn
  );
  await ygnInstance.deployed();
  console.log("FYGN deployed at " + ygnInstance.address);
  await ygnInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: ygnInstance.address,
    constructorArguments: [
      ConstructorParams.ygn
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
