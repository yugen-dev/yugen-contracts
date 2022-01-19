// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../fygn_claimable_burner_config.json");

async function main() {
  const FYGNClaimableBurner = await hre.ethers.getContractFactory("FYGNClaimableBurner");
  const fYGNClaimableBurnerInstance = await FYGNClaimableBurner.deploy(
    ConstructorParams.fygn,
    ConstructorParams.ygn,
    ConstructorParams.ygnStaker
  );
  await fYGNClaimableBurnerInstance.deployed();
  console.log("FYGNClaimableBurner deployed at " + fYGNClaimableBurnerInstance.address);
  await fYGNClaimableBurnerInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: fYGNClaimableBurnerInstance.address,
    constructorArguments: [
      ConstructorParams.fygn,
      ConstructorParams.ygn,
      ConstructorParams.ygnStaker
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
