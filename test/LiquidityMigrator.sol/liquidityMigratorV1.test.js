const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { getBigNumber } = require("../utilities/index");
const { advanceBlock, advanceTime } = require("../utilities/time");
const { parseEther } = require("ethers/lib/utils");
const ConstructorParams = require("../../scripts/constructorParams.json");
const QuickSwapStrategyParams = require("../../scripts/quick_swap_farms_strategy.json");
const EthalendParams = require("../../scripts/ethalend_vaults_strategy.json");

describe.only("Liquidity Migrator V1", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];

    const { fYGN, farm, rewardManager } = ConstructorParams.liquidityMigratorV1;

    const Farm = await ethers.getContractFactory("Farm");
    this.farm = Farm.attach(farm);

    const QuickSwapFarmsStrategy = await hre.ethers.getContractFactory("QuickSwapFarmsStrategy");
    this.quickSwapFarmsStrategyInstance = await QuickSwapFarmsStrategy.deploy(
      QuickSwapStrategyParams.asset,
      QuickSwapStrategyParams.rewardToken,
      QuickSwapStrategyParams.stakingRewardsContract,
      this.signer.address,
      farm,
      QuickSwapStrategyParams.quickTokenAddress
    );
    await this.quickSwapFarmsStrategyInstance.deployed();
    console.log(
      "QuickSwapFarmsStrategy deployed at " + this.quickSwapFarmsStrategyInstance.address
    );

    const EthalendVaultsQuickSwapStrategy = await hre.ethers.getContractFactory(
      "EthalendVaultsQuickSwapStrategy"
    );
    const {
      ASSET_ADDRESS,
      SECONDARY_ASSET,
      ethalendCurveLogicContract,
      ethalendEVault,
      ethalendQuickSwapLogicContract,
      ethalendTransferLogicContract,
      ethalendVaultLogicContract,
      registry,
      REWARD_TOKEN,
      ETHA_TOKEN,
      curvePool,
    } = EthalendParams.ethalendDAIVault;

    this.ethalendVaultsQuickSwapStrategyInstance = await EthalendVaultsQuickSwapStrategy.deploy(
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
      this.signer.address
    );
    console.log(
      "EthalendVaultsQuickSwapStrategy deployed at " +
        this.ethalendVaultsQuickSwapStrategyInstance.address
    );
    this.ethalendVaultsQuickSwapStrategyInstance.updateFarmAddress(this.farm.address);

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.fYGN = ERC20Mock.attach(fYGN);
    this.quick = ERC20Mock.attach(QuickSwapStrategyParams.quickTokenAddress);
    this.lpToken = ERC20Mock.attach(QuickSwapStrategyParams.asset);
    this.dai = ERC20Mock.attach(ASSET_ADDRESS);
    this.xYGN = ERC20Mock.attach("0x940920386550c8Bfdd5F0dC685c23A6148e8cD38");

    const RewardManagerFactory = await ethers.getContractFactory("RewardManagerFactory");
    this.rewardManager = RewardManagerFactory.attach(rewardManager);

    const LiquidityMigratorV1 = await ethers.getContractFactory("LiquidityMigratorV1");
    this.liquidityMigrator = await LiquidityMigratorV1.deploy(farm, rewardManager, fYGN);
    console.log("Migrator deployed at " + this.liquidityMigrator.address);

    this.deployerAddress = "0x820De2eb0EE8007Ee237E02aCe3BF2b9cD0DdF1a";
    this.userAddress = "0xf05F5D4aD1b3fd5Ad57Ba5cA386D0DB2E8B317Aa";
    this.balanceToSet = "0x3635C9ADC5DEA00000";

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [this.deployerAddress],
    });
    const rewardManagerOwner = await ethers.getSigner(this.deployerAddress);
    await hre.network.provider.send("hardhat_setBalance", [
      this.deployerAddress,
      this.balanceToSet,
    ]);
    await this.rewardManager
      .connect(rewardManagerOwner)
      .updateRewardDistributor(this.liquidityMigrator.address, true);
    await this.rewardManager
      .connect(rewardManagerOwner)
      .updateWhitelistAddress(0, this.liquidityMigrator.address, true);

    console.log("Configuration of Reward Manager is done for migrator");
    //adding child farms to yugen
    await this.farm
      .connect(rewardManagerOwner)
      .add(100, this.lpToken.address, 0, 300, this.quickSwapFarmsStrategyInstance.address, true);
    await this.farm
      .connect(rewardManagerOwner)
      .add(
        100,
        this.dai.address,
        0,
        300,
        this.ethalendVaultsQuickSwapStrategyInstance.address,
        true
      );

    console.log("Added new strategies to farms");

    await hre.network.provider.send("hardhat_setBalance", [this.userAddress, this.balanceToSet]);
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [this.userAddress],
    });
    this.userSigner = await ethers.getSigner(this.userAddress);
    await this.farm.connect(this.userSigner).addUserToWhiteList(this.liquidityMigrator.address);
    console.log("Migrator whitelisted by the user's address");
  });

  it("should set correct state variables", async function () {
    const farm = await this.liquidityMigrator.farm();
    const fYGN = await this.liquidityMigrator.fYGN();
    const rewardManager = await this.liquidityMigrator.rewardManager();
    const owner = await this.liquidityMigrator.owner();

    expect(farm).to.equal(this.farm.address);
    expect(fYGN).to.equal(this.fYGN.address);
    expect(rewardManager).to.equal(this.rewardManager.address);
    expect(owner).to.equal(this.signer.address);
  });

  it("should switch NSHARE_WMATIC nachoXYZ strategy LP liquidity to new quickswap NSHARE_WMATIC pool", async function () {
    const oldFarmPid = 4;
    const newFarmPid = 12;

    let oldLPTokenAmountInFarm = (await this.farm.userInfo(oldFarmPid, this.userSigner.address))
      .amount;
    console.log(`LP tokens in old NSHARE_WMATIC farm - ${String(oldLPTokenAmountInFarm)}`);
    let newLPTokenAmountInFarm = (await this.farm.userInfo(newFarmPid, this.userSigner.address))
      .amount;
    console.log(`LP tokens in new NSHARE_WMATIC farm - ${String(newLPTokenAmountInFarm)}`);
    let userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(this.userSigner.address))
      .totalVested;
    console.log(`Vested FYGN - ${String(userVestedFYGN)}`);
    console.log(`XYGN Balance ${await this.xYGN.balanceOf(this.userSigner.address)}`);

    await this.liquidityMigrator
      .connect(this.userSigner)
      .switchLiquidity(oldFarmPid, this.lpToken.address, oldLPTokenAmountInFarm, true, newFarmPid);

    oldLPTokenAmountInFarm = (await this.farm.userInfo(oldFarmPid, this.userSigner.address)).amount;
    console.log(
      `LP tokens in old NSHARE_WMATIC farm after switch - ${String(oldLPTokenAmountInFarm)}`
    );
    newLPTokenAmountInFarm = (await this.farm.userInfo(newFarmPid, this.userSigner.address)).amount;
    console.log(
      `LP tokens in new NSHARE_WMATIC farm after switch - ${String(newLPTokenAmountInFarm)}`
    );
    userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(this.userSigner.address))
      .totalVested;
    console.log(`Vested FYGN - ${String(userVestedFYGN)}`);
    console.log(`XYGN Balance ${await this.xYGN.balanceOf(this.userSigner.address)}`);
  });

  it("should allow proper functioning of both NSHARE_WMATIC lp pools together", async function () {
    this.newSignerAddress = "0xc04daf3df8b917afa96fd41a1c5d6dbc23aad3d7";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [this.newSignerAddress],
    });
    this.newSigner = await ethers.getSigner(this.newSignerAddress);
    const oldFarmPid = 4;
    const newFarmPid = 12;

    console.log("Depositing in new pool");
    const depositAmount = parseEther("5");
    await this.lpToken.connect(this.newSigner).approve(this.farm.address, depositAmount);
    await this.farm.connect(this.newSigner).deposit(newFarmPid, depositAmount, false);
    let userInfo = await this.farm.userInfo(newFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(depositAmount);
    expect(await this.fYGN.balanceOf(this.newSigner.address)).to.equal(String(0));

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farm.pendingFYGN(newFarmPid, this.newSigner.address)).gt(0);
    expect(await this.farm.canHarvest(newFarmPid, this.newSigner.address)).to.equal(true);
    expect(await this.farm.pendingFYGN(newFarmPid, this.newSigner.address)).gt(0);
    console.log("withdrawing in new pool");
    await this.farm.connect(this.newSigner).withdraw(newFarmPid, depositAmount.div(2), false);
    userInfo = await this.farm.userInfo(newFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(depositAmount.div(2));

    console.log("Depositing in old pool");
    const newDepositAmount = parseEther("7");
    await this.lpToken.connect(this.newSigner).approve(this.farm.address, newDepositAmount);
    await this.farm.connect(this.newSigner).deposit(oldFarmPid, newDepositAmount, false);
    userInfo = await this.farm.userInfo(oldFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(newDepositAmount);

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farm.pendingFYGN(oldFarmPid, this.newSigner.address)).gt(0);
    expect(await this.farm.pendingFYGN(oldFarmPid, this.newSigner.address)).gt(0);
    console.log("Withdrawing in old pool");
    await this.farm.connect(this.newSigner).withdraw(oldFarmPid, newDepositAmount.div(2), false);
    userInfo = await this.farm.userInfo(oldFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(newDepositAmount.div(2));

    //migrator flow
    await this.farm.connect(this.newSigner).addUserToWhiteList(this.liquidityMigrator.address);
    console.log("Migrator whitelisted by the new signer address");

    let oldLPTokenAmountInFarm = (await this.farm.userInfo(oldFarmPid, this.newSigner.address))
      .amount;
    console.log(`LP tokens in old NSHARE_WMATIC farm - ${String(oldLPTokenAmountInFarm)}`);
    let newLPTokenAmountInFarm = (await this.farm.userInfo(newFarmPid, this.newSigner.address))
      .amount;
    console.log(`LP tokens in new NSHARE_WMATIC farm - ${String(newLPTokenAmountInFarm)}`);
    let userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(this.newSigner.address))
      .totalVested;
    console.log(`Vested FYGN - ${String(userVestedFYGN)}`);

    await this.liquidityMigrator
      .connect(this.newSigner)
      .switchLiquidity(oldFarmPid, this.lpToken.address, oldLPTokenAmountInFarm, false, newFarmPid);

    oldLPTokenAmountInFarm = (await this.farm.userInfo(oldFarmPid, this.newSigner.address)).amount;
    console.log(
      `LP tokens in old NSHARE_WMATIC farm after switch - ${String(oldLPTokenAmountInFarm)}`
    );
    newLPTokenAmountInFarm = (await this.farm.userInfo(newFarmPid, this.newSigner.address)).amount;
    console.log(
      `LP tokens in new NSHARE_WMATIC farm after switch - ${String(newLPTokenAmountInFarm)}`
    );
    userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(this.newSigner.address))
      .totalVested;
    console.log(`Vested FYGN - ${String(userVestedFYGN)}`);
  });

  it("should allow proper functioning of both DAI pools together", async function () {
    this.newSignerAddress = "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [this.newSignerAddress],
    });
    this.newSigner = await ethers.getSigner(this.newSignerAddress);
    const oldFarmPid = 10;
    const newFarmPid = 13;

    console.log("Depositing in new pool");
    const depositAmount = parseEther("5");
    await this.dai.connect(this.newSigner).approve(this.farm.address, depositAmount);
    await this.farm.connect(this.newSigner).deposit(newFarmPid, depositAmount, false);
    let userInfo = await this.farm.userInfo(newFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(depositAmount);
    expect(await this.fYGN.balanceOf(this.newSigner.address)).to.equal(String(0));

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farm.pendingFYGN(newFarmPid, this.newSigner.address)).gt(0);
    expect(await this.farm.canHarvest(newFarmPid, this.newSigner.address)).to.equal(true);
    expect(await this.farm.pendingFYGN(newFarmPid, this.newSigner.address)).gt(0);
    console.log("withdrawing in new pool");
    await this.farm.connect(this.newSigner).withdraw(newFarmPid, depositAmount.div(2), false);
    userInfo = await this.farm.userInfo(newFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(depositAmount.div(2));

    console.log("Depositing in old pool");
    const newDepositAmount = parseEther("7");
    await this.dai.connect(this.newSigner).approve(this.farm.address, newDepositAmount);
    await this.farm.connect(this.newSigner).deposit(oldFarmPid, newDepositAmount, false);
    userInfo = await this.farm.userInfo(oldFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(newDepositAmount);

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farm.pendingFYGN(oldFarmPid, this.newSigner.address)).gt(0);
    expect(await this.farm.pendingFYGN(oldFarmPid, this.newSigner.address)).gt(0);
    console.log("Withdrawing in old pool");
    await this.farm.connect(this.newSigner).withdraw(oldFarmPid, newDepositAmount.div(2), false);
    userInfo = await this.farm.userInfo(oldFarmPid, this.newSigner.address);
    expect(userInfo.amount).to.equal(newDepositAmount.div(2));

    //migrator flow
    await this.farm.connect(this.newSigner).addUserToWhiteList(this.liquidityMigrator.address);
    console.log("Migrator whitelisted by the new signer address");

    let oldLPTokenAmountInFarm = (await this.farm.userInfo(oldFarmPid, this.newSigner.address))
      .amount;
    console.log(`LP tokens in old DAI farm - ${String(oldLPTokenAmountInFarm)}`);
    let newLPTokenAmountInFarm = (await this.farm.userInfo(newFarmPid, this.newSigner.address))
      .amount;
    console.log(`LP tokens in new DAI farm - ${String(newLPTokenAmountInFarm)}`);
    let userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(this.newSigner.address))
      .totalVested;
    console.log(`Vested FYGN - ${String(userVestedFYGN)}`);

    await this.liquidityMigrator
      .connect(this.newSigner)
      .switchLiquidity(oldFarmPid, this.dai.address, oldLPTokenAmountInFarm, false, newFarmPid);

    oldLPTokenAmountInFarm = (await this.farm.userInfo(oldFarmPid, this.newSigner.address)).amount;
    console.log(`LP tokens in old DAI farm after switch - ${String(oldLPTokenAmountInFarm)}`);
    newLPTokenAmountInFarm = (await this.farm.userInfo(newFarmPid, this.newSigner.address)).amount;
    console.log(`LP tokens in new DAI farm after switch - ${String(newLPTokenAmountInFarm)}`);
    userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(this.newSigner.address))
      .totalVested;
    console.log(`Vested FYGN - ${String(userVestedFYGN)}`);
  });
});
