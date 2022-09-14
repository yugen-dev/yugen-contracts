const hre = require("hardhat");
const ConstructorParams = {
  quickswapRouter: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", //uniswapV2 Router (quickswap),
  dystRouter: "0xbE75Dd16D029c6B32B7aD57A0FD9C1c20Dd2862e", //dyst router
  weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", //wmatic
};

async function main() {
  // We get the contract to deploy
  const UniversalSingleSidedLiquidity = await hre.ethers.getContractFactory(
    "UniversalSingleSidedLiquidity"
  );
  const universalSingleSidedLiquidityInstance = await UniversalSingleSidedLiquidity.deploy(
    ConstructorParams.quickswapRouter,
    ConstructorParams.dystRouter,
    ConstructorParams.weth
  );

  console.log(
    "UniversalSingleSidedLiquidity contract deployed at:",
    universalSingleSidedLiquidityInstance.address
  );

  await universalSingleSidedLiquidityInstance.deployTransaction.wait([(confirms = 6)]);

  await hre.run("verify:verify", {
    address: universalSingleSidedLiquidityInstance.address,
    constructorArguments: [
      ConstructorParams.quickswapRouter,
      ConstructorParams.dystRouter,
      ConstructorParams.weth,
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
