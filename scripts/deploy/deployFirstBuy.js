// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  const FirstBuy = await hre.ethers.getContractFactory("FirstBuy");
  const firstBuyContractInstance = await FirstBuy.deploy(
    ConstructorParams.YGN_TOKEN,
    ConstructorParams.USDC_TOKEN,
    ConstructorParams.FIRST_BUY_DEX_ROUTER,
    ConstructorParams.LP_RECEIVER_ADDRESS,
    ConstructorParams.YGN_RECEIVER_ADDRESS
  );
  await firstBuyContractInstance.deployed();
  console.log("FirstBuy Contract deployed at " + firstBuyContractInstance.address);
  await firstBuyContractInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: firstBuyContractInstance.address,
    constructorArguments: [
      ConstructorParams.YGN_TOKEN,
      ConstructorParams.USDC_TOKEN,
      ConstructorParams.FIRST_BUY_DEX_ROUTER,
      ConstructorParams.LP_RECEIVER_ADDRESS,
      ConstructorParams.YGN_RECEIVER_ADDRESS,
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
