// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const ConstructorParams = require("../../ethalend_vaults_strategy.json");

async function main() {
  const EthalendVaultsQuickSwapStrategy = await hre.ethers.getContractFactory(
    "EthalendVaultsQuickSwapStrategy"
  );
  const {
    ASSET_ADDRESS,
    SECONDARY_ASSET,
    REWARD_TOKEN,
    ETHA_TOKEN,
    registry,
    curvePool,
    ethalendTransferLogicContract,
    ethalendCurveLogicContract,
    ethalendQuickSwapLogicContract,
    ethalendVaultLogicContract,
    ethalendEVault,
    YGN_CONVERTER,
  } = ConstructorParams.ethalendUSDTVault;

  const ethalendVaultsQuickSwapStrategyInstance = await EthalendVaultsQuickSwapStrategy.deploy(
    ASSET_ADDRESS,
    SECONDARY_ASSET,
    REWARD_TOKEN,
    ETHA_TOKEN,
    registry,
    curvePool,
    ethalendTransferLogicContract,
    ethalendCurveLogicContract,
    ethalendQuickSwapLogicContract,
    ethalendVaultLogicContract,
    ethalendEVault,
    YGN_CONVERTER
  );
  await ethalendVaultsQuickSwapStrategyInstance.deployed();
  console.log(
    "USDT EthalendVaultsQuickSwapStrategy deployed at " +
      ethalendVaultsQuickSwapStrategyInstance.address
  );
  await ethalendVaultsQuickSwapStrategyInstance.deployTransaction.wait([(confirms = 10)]);

  await hre.run("verify:verify", {
    address: ethalendVaultsQuickSwapStrategyInstance.address,
    constructorArguments: [
      ASSET_ADDRESS,
      SECONDARY_ASSET,
      REWARD_TOKEN,
      ETHA_TOKEN,
      registry,
      curvePool,
      ethalendTransferLogicContract,
      ethalendCurveLogicContract,
      ethalendQuickSwapLogicContract,
      ethalendVaultLogicContract,
      ethalendEVault,
      FEE_ADDRESS,
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
