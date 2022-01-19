// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../constructorParams.json");

async function main() {
  const UniversalConverter = await hre.ethers.getContractFactory("UniversalConverter");
  const converterInstance = await UniversalConverter.deploy(
    ConstructorParams.YGN_TOKEN,
    ConstructorParams.FYGN_BURNER,
    ConstructorParams.BURNER_ALLOCATION,
    ConstructorParams.YGN_STAKER,
    ConstructorParams.STAKERS_ALLOCATION,
    ConstructorParams.FEE_ADDRESS,
    ConstructorParams.PLATFORM_FEES_ALLOCATION,
    ConstructorParams.TREASURY,
    ConstructorParams.TREASURY_ALLOCATION
  );
  await converterInstance.deployed();
  console.log("Converter deployed at " + converterInstance.address);
  await converterInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: converterInstance.address,
    constructorArguments: [
      ConstructorParams.YGN_TOKEN,
      ConstructorParams.FYGN_BURNER,
      ConstructorParams.BURNER_ALLOCATION,
      ConstructorParams.YGN_STAKER,
      ConstructorParams.STAKERS_ALLOCATION,
      ConstructorParams.FEE_ADDRESS,
      ConstructorParams.PLATFORM_FEES_ALLOCATION,
      ConstructorParams.TREASURY,
      ConstructorParams.TREASURY_ALLOCATION,
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
