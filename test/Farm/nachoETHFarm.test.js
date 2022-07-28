const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const { getBigNumber } = require("../utilities/index");
const { advanceBlock, advanceTime } = require("../utilities/time");
const QuickSwapStrategyParams = require("../../scripts/quick_swap_farms_strategy.json");
const QuickSwapDualStrategyParams = require("../../scripts/quick_swap_farms_dual_strategy.json");

const { parseEther } = require("ethers/lib/utils");

describe("Nacho-ETH Double Strategy Tests - Yugen Farm Contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.feeAddress = QuickSwapDualStrategyParams.ygnConverter;

    const Farm = await ethers.getContractFactory("Farm");
    this.farmInstance = Farm.attach(QuickSwapDualStrategyParams.farm);

    // const FarmWrapper = await hre.ethers.getContractFactory("FarmWrapper");
    // this.farmWrapper = FarmWrapper.attach("0xDC02DE9a462D36A4a449e1bA443b62d5A0A3444E");

    const FYGN = await ethers.getContractFactory("FYGN");
    this.fygnTokenInstance = FYGN.attach("0x397e10ee5e315f69b23cb6c8a913a589b5850c80");

    this.deployerAddress = "0x820De2eb0EE8007Ee237E02aCe3BF2b9cD0DdF1a";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [this.deployerAddress],
    });
    this.deployer = await ethers.getSigner(this.deployerAddress);

    const QuickSwapFarmsStrategyDual = await hre.ethers.getContractFactory(
      "QuickSwapFarmsStrategyDual"
    );
    this.quickSwapFarmsStrategyInstance = await QuickSwapFarmsStrategyDual.deploy(
      QuickSwapDualStrategyParams.asset,
      QuickSwapDualStrategyParams.rewardTokenA,
      QuickSwapDualStrategyParams.rewardTokenB,
      QuickSwapDualStrategyParams.quickTokenAddress,
      QuickSwapDualStrategyParams.stakingRewardsContract,
      this.feeAddress,
      this.farmInstance.address
    );
    await this.quickSwapFarmsStrategyInstance.deployed();
    console.log(
      "QuickSwapFarmsStrategyDual deployed at " + this.quickSwapFarmsStrategyInstance.address
    );

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    //LP token
    this.assetTokenInstance = ERC20Mock.attach(QuickSwapDualStrategyParams.asset);
    this.quickToken = ERC20Mock.attach(QuickSwapDualStrategyParams.quickTokenAddress);
    this.wmatic = ERC20Mock.attach(QuickSwapDualStrategyParams.rewardTokenB);

    // this.bico = ERC20Mock.attach(QuickSwapDualStrategyParams.rewardTokenB);

    //adding child farms to yugen
    await this.farmInstance
      .connect(this.deployer)
      .add(
        100,
        this.assetTokenInstance.address,
        0,
        300,
        this.quickSwapFarmsStrategyInstance.address,
        true
      );

    const depositor = "0x9FB134004c101aCf87EcC02d43397291219AC953";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [depositor],
    });
    this.depositor = await ethers.getSigner(depositor);
    this.newFarmPid = 17;
  });

  it("should set correct state variables", async function () {
    const poolInfo12 = await this.farmInstance.poolInfo(this.newFarmPid);
    expect(poolInfo12.lpToken).to.equal(this.assetTokenInstance.address);
    expect(poolInfo12.allocPoint).to.equal(String(100));
    expect(poolInfo12.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo12.harvestInterval).to.equal(Number(300));
    expect(poolInfo12.strategy).to.equal(this.quickSwapFarmsStrategyInstance.address);
  });

  it("should correctly update pool alloc point", async function () {
    await this.farmInstance.connect(this.deployer).updatePoolAllocPoint(this.newFarmPid, 200, true);
    const poolInfo = await this.farmInstance.poolInfo(this.newFarmPid);
    expect(poolInfo.allocPoint).to.equal(String(200));
  });

  it("should correctly update pool withdrawal fee", async function () {
    await this.farmInstance
      .connect(this.deployer)
      .updatePoolWithdrawalFeeBP(this.newFarmPid, 200, true);
    let poolInfo = await this.farmInstance.poolInfo(this.newFarmPid);
    expect(poolInfo.withdrawalFeeBP).to.equal(Number(200));
    await this.farmInstance
      .connect(this.deployer)
      .updatePoolWithdrawalFeeBP(this.newFarmPid, 0, true);
    poolInfo = await this.farmInstance.poolInfo(this.newFarmPid);
    expect(poolInfo.withdrawalFeeBP).to.equal(Number(0));
  });

  it("should correctly update pool harvest interval", async function () {
    await this.farmInstance
      .connect(this.deployer)
      .updatePoolHarvestInterval(this.newFarmPid, 200, true);
    const poolInfo = await this.farmInstance.poolInfo(this.newFarmPid);
    expect(poolInfo.harvestInterval).to.equal(String(200));
  });

  it("should correctly set the pool config", async function () {
    await this.farmInstance.connect(this.deployer).set(this.newFarmPid, 100, 0, 300, true);
    const poolInfo = await this.farmInstance.poolInfo(this.newFarmPid);
    const totalAllocPoint = await this.farmInstance.totalAllocPoint();
    expect(poolInfo.allocPoint).to.equal(String(100));
    expect(poolInfo.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo.harvestInterval).to.equal(String(300));
  });

  it("should pause deposit/withdraw when contract is paused", async function () {
    await this.farmInstance.connect(this.deployer).pause();
    const depositAmount = getBigNumber(50);
    await this.assetTokenInstance
      .connect(this.depositor)
      .approve(this.farmInstance.address, MaxUint256);
    // await this.eth.connect(this.depositor).approve(this.farmWrapperInstance.address, MaxUint256);
    // await expect(
    //   this.farmWrapperInstance
    //     .connect(this.depositor)
    //     .deposit(this.newFarmPid, depositAmount, false)
    // ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance.connect(this.depositor).deposit(this.newFarmPid, depositAmount, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance.connect(this.depositor).deposit(this.newFarmPid, depositAmount, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance.connect(this.depositor).withdraw(this.newFarmPid, depositAmount, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance
        .connect(this.depositor)
        .depositFor(this.newFarmPid, depositAmount, this.depositor.address, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance
        .connect(this.depositor)
        .withdrawFor(this.newFarmPid, depositAmount, this.depositor.address, false)
    ).to.be.revertedWith("Pausable: paused");
    await this.farmInstance.connect(this.deployer).unpause();
  });

  it("should correctly deposit in new pool", async function () {
    console.log(
      `Asset Balance for the user before deposit - `,
      await this.assetTokenInstance.balanceOf(this.depositor.address)
    );

    this.depositAmount = parseEther("0.000001");
    await this.farmInstance
      .connect(this.depositor)
      .deposit(this.newFarmPid, this.depositAmount, false);

    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let totalInputTokensStakedInStrategy = await this.farmInstance.getLpTokenAmount(
      this.newFarmPid
    );
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;

    expect(userInfo.amount).to.equal(this.depositAmount);
    expect(totalInputTokensStakedInStrategy).to.equal(this.depositAmount);
    expect(totalInputTokensStaked).to.equal(this.depositAmount);
    console.log(
      `Asset Balance for the user after deposit - `,
      await this.assetTokenInstance.balanceOf(this.depositor.address)
    );
  });

  it("should increase the pending rewards for the user", async function () {
    this.fYGNBalanceBeforeHarvest = String(
      await this.fygnTokenInstance.balanceOf(this.depositor.address)
    );
    console.log("fYGN balance before harvest", this.fYGNBalanceBeforeHarvest);
    expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(Number(0));
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    // expect(await this.farmInstance.pendingFYGN(this.newFarmPid, this.depositor.address)).to.equal(
    //   getBigNumber(5)
    // );
    // expect(await this.farmInstance.canHarvest(this.newFarmPid, this.depositor.address)).to.equal(
    //   true
    // );
    expect(await this.assetTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
  });

  it("should harvest fYGN rewards for the user", async function () {
    //checking harvest by deposit 0
    await this.farmInstance.connect(this.depositor).deposit(this.newFarmPid, 0, false);
    this.fYGNBalanceAfterHarvest = String(
      await this.fygnTokenInstance.balanceOf(this.depositor.address)
    );
    console.log("fYGN Balance after harvest", this.fYGNBalanceAfterHarvest);
    expect(Number(this.fYGNBalanceAfterHarvest)).to.be.greaterThan(Number(0));
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let totalInputTokensStakedInStrategy = await this.farmInstance.getLpTokenAmount(
      this.newFarmPid
    );
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount);
    expect(totalInputTokensStakedInStrategy).to.equal(this.depositAmount);
    expect(totalInputTokensStaked).to.equal(this.depositAmount);
    expect(Number(userInfo.rewardDebt)).to.be.greaterThan(Number(0));
  });

  it("should withdraw asset and claim rewards", async function () {
    await this.farmInstance
      .connect(this.depositor)
      .withdraw(this.newFarmPid, this.depositAmount.div(2), false);
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount.div(2));
    expect(lpSupply).to.equal(this.depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(this.depositAmount.div(2));
    // expect(await this.farmInstance.pendingFYGN(this.newFarmPid, this.depositor.address)).to.equal(
    //   getBigNumber(1)
    // );
    // expect((await this.fygnTokenInstance.balanceOf(this.depositor.address)) / 10 ** 18).to.equal(
    //   Number(6)
    // );
    expect(await this.quickToken.balanceOf(this.feeAddress)).gt(0);
    // expect(await this.bico.balanceOf(this.feeAddress)).gt(0);
    console.log("quick balance in converter : ", await this.quickToken.balanceOf(this.feeAddress));
    // console.log("bico balance in converter : ", await this.bico.balanceOf(this.feeAddress));
  });

  it("should execute emergency withdraw from staking pool", async function () {
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(this.newFarmPid);
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    // expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(
    //   parseEther("6")
    // );
    expect(Number(await this.quickToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    console.log(
      `Final USDC Balance for the user - `,
      await this.assetTokenInstance.balanceOf(this.depositor.address)
    );
  });

  it("should disable strategy to rescue funds and handle deposit/withdraw etc.", async function () {
    //New deposit
    await this.farmInstance
      .connect(this.depositor)
      .deposit(this.newFarmPid, this.depositAmount.div(2), true);
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let totalInputTokensStakedInStrategy = await this.farmInstance.getLpTokenAmount(
      this.newFarmPid
    );
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount.div(2));
    expect(totalInputTokensStakedInStrategy).to.equal(this.depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(this.depositAmount.div(2));

    //Calling Rescue Funds
    await this.quickSwapFarmsStrategyInstance
      .connect(this.signer)
      .rescueFunds(this.assetTokenInstance.address);
    for (let i = 0; i < 10; i++) {
      advanceTime(60);
      advanceBlock();
    }
    await expect(
      this.farmInstance
        .connect(this.depositor)
        .deposit(this.newFarmPid, this.depositAmount.div(2), true)
    ).to.be.revertedWith("Strategy is disabled");

    //withdraw
    await this.farmInstance
      .connect(this.depositor)
      .withdraw(this.newFarmPid, this.depositAmount.div(4), false);
    userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount.div(4));
    expect(lpSupply).to.equal(this.depositAmount.div(4));
    expect(totalInputTokensStaked).to.equal(this.depositAmount.div(4));

    //emergency withdraw
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(this.newFarmPid);
    userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    // expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(
    //   parseEther("19")
    // );
    expect(Number(await this.quickToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    // expect(Number(await this.bico.balanceOf(this.feeAddress))).to.be.greaterThan(0);
  });
});
