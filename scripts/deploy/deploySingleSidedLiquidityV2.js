const hre = require("hardhat");
const ConstructorParams = {
  router: "",
  weth: "",
};

async function main() {
  // We get the contract to deploy
  const SingleSidedLiquidityV2 = await hre.ethers.getContractFactory("SingleSidedLiquidityV2");
  const singleSidedLiquidityV2Instance = await SingleSidedLiquidityV2.deploy(
    ConstructorParams.router,
    ConstructorParams.weth
  );

  console.log(
    "SingleSidedLiquidityV2 contract deployed at:",
    singleSidedLiquidityV2Instance.address
  );

  await singleSidedLiquidityV2Instance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: singleSidedLiquidityV2Instance.address,
    constructorArguments: [ConstructorParams.router, ConstructorParams.weth],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
