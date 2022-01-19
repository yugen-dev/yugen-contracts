// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../ygn_constructor_param.json");

async function main() {
  const YGN = await hre.ethers.getContractFactory("YUGEN");
  const ygnInstance = await YGN.deploy(ConstructorParams.tokenholder);
  await ygnInstance.deployed();
  console.log("YGN deployed at " + ygnInstance.address);
  await ygnInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: ygnInstance.address,
    contract: "contracts/YGN.sol:YUGEN",
    constructorArguments: [
      ConstructorParams.tokenholder
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
