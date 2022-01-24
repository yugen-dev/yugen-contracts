const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { getBigNumber } = require("../utilities/index");
const { parseEther } = require("ethers/lib/utils");
const ConstructorParams = require("../../scripts/constructorParams.json");

describe.only("Liquidity Migrator V1", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];

    const { fYGN, farm, rewardManager } = ConstructorParams.liquidityMigratorV1;

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.fGYN = ERC20Mock.attach(fYGN);

    const Farm = await ethers.getContractFactory("Farm");
    this.farm = Farm.attach(farm);

    const RewardManagerFactory = await ethers.getContractFactory("RewardManagerFactory");
    this.rewardManager = RewardManagerFactory.attach(rewardManager);

    const LiquidityMigratorV1 = await ethers.getContractFactory("LiquidityMigratorV1");
    this.liquidityMigrator = await LiquidityMigratorV1.deploy(farm, rewardManager, fYGN);
    console.log("Migrator deployed at " + this.liquidityMigrator.address);

    this.deployerAddress = "0x820De2eb0EE8007Ee237E02aCe3BF2b9cD0DdF1a";
    this.userAddress = this.userAddress;
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
    const fGYN = await this.liquidityMigrator.fGYN();
    const rewardManager = await this.liquidityMigrator.rewardManager();
    const owner = await this.liquidityMigrator.owner();

    expect(farm).to.equal(this.farm.address);
    expect(fGYN).to.equal(this.fGYN.address);
    expect(rewardManager).to.equal(this.rewardManager.address);
    expect(owner).to.equal(this.signer.address);
  });

  it("should switch NACHO-WETH nachoXYZ strategy LP liquidity to new NACHO-WETH pool", async function () {
    const oldFarmPid = 0;
    const newFarmPid = 1;
    const tokenAddress = "";

    let oldLPTokenAmountInFarm = (await this.farm.userInfo(oldFarmPid, signer.address)).amount;
    console.log(`LP tokens in old NACHO-WETH farm - ${Number(oldLPTokenAmountInFarm)}`);
    let newLPTokenAmountInFarm = (await this.farm.userInfo(newFarmPid, signer.address)).amount;
    console.log(`LP tokens in new NACHO-WETH farm - ${Number(newLPTokenAmountInFarm)}`);
    let userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(signer.address))
      .totalVested;
    console.log(`Vested FYGN - ${Number(userVestedFYGN)}`);

    await this.liquidityMigrator
      .connect(signer)
      .switchLiquidity(oldFarmPid, tokenAddress, oldLPTokenAmountInFarm, false, newFarmPid);

    oldLPTokenAmountInFarm = (await this.farm.userInfo(1, signer.address)).amount;
    console.log(
      `LP tokens in old NACHO-WETH farm after switch - ${Number(oldLPTokenAmountInFarm)}`
    );
    newLPTokenAmountInFarm = (await this.farm.userInfo(0, signer.address)).amount;
    console.log(
      `LP tokens in new NACHO-WETH farm after switch - ${Number(newLPTokenAmountInFarm)}`
    );
    userVestedFYGN = (await this.rewardManager.userTotalVestingInfo(signer.address)).totalVested;
    console.log(`Vested FYGN - ${Number(userVestedFYGN)}`);
  });
});
