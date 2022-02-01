const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const { getBigNumber } = require("../../../utilities/index");
const { advanceBlock, advanceTime } = require("../../../utilities/time");
const ConstructorParams = require("../../../../scripts/deploy/fantom/tarot/constructor_params.json");
const { parseEther } = require("ethers/lib/utils");
const FYGN_PER_BLOCK = "1000000000000000000";

describe("Tarot FTM Strategy - Yugen Farm Contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.feeAddress = "0x61e2A077a8Baae0ffb7d7bA7792d7FE921995bfB";
    this.provider = hre.ethers.provider;

    const FYGN = await ethers.getContractFactory("FYGN");
    this.fygnTokenInstance = await FYGN.deploy("Farm YUGEN", "FYGN");
    console.log("FYGN Token Deployed at", this.fygnTokenInstance.address);

    const latestBlock = await this.provider.getBlock("latest");
    const Farm = await ethers.getContractFactory("Farm");
    this.farmInstance = await Farm.deploy(
      this.fygnTokenInstance.address,
      FYGN_PER_BLOCK,
      this.feeAddress,
      latestBlock.number,
      latestBlock.number
    );
    console.log("Farm deployed at " + this.farmInstance.address);
    await this.fygnTokenInstance.whitelistMinter(this.farmInstance.address);

    const TarotSupplyVaultStrategy = await hre.ethers.getContractFactory(
      "TarotSupplyVaultStrategy"
    );
    this.tarotSupplyVaultStrategyInstance = await TarotSupplyVaultStrategy.deploy(
      ConstructorParams.FTM.asset,
      ConstructorParams.FTM.supplyVault,
      ConstructorParams.supplyVaultRouter,
      this.feeAddress,
      this.farmInstance.address
    );
    console.log(
      "TarotSupplyVaultStrategy deployed at " + this.tarotSupplyVaultStrategyInstance.address
    );

    const FTMWrapper = await hre.ethers.getContractFactory("FTMWrapper");
    this.ftmWrapperInstance = await FTMWrapper.deploy(
      this.farmInstance.address,
      ConstructorParams.FTM.asset
    );
    console.log("FTM Wrapper deployed at " + this.ftmWrapperInstance.address);

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.assetTokenInstance = ERC20Mock.attach(ConstructorParams.FTM.asset);

    //adding child farms to yugen
    await this.farmInstance.add(
      100,
      this.assetTokenInstance.address,
      0,
      300,
      this.tarotSupplyVaultStrategyInstance.address,
      true
    );

    const depositor = "0x93C08a3168fC469F3fC165cd3A471D19a37ca19e";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [depositor],
    });
    this.depositor = await ethers.getSigner(depositor);
  });

  it("should set correct state variables", async function () {
    const fygn = await this.farmInstance.fYGN();
    const fYGNPerBlock = await this.farmInstance.fYGNPerBlock();
    const ygnConverter = await this.farmInstance.ygnConverter();
    const totalAllocPoint = await this.farmInstance.totalAllocPoint();
    const isRewardManagerEnabled = await this.farmInstance.isRewardManagerEnabled();
    const rewardManager = await this.farmInstance.rewardManager();
    const owner = await this.farmInstance.owner();
    const poolInfo0 = await this.farmInstance.poolInfo(0);

    expect(fygn).to.equal(this.fygnTokenInstance.address);
    expect(fYGNPerBlock).to.equal(String(FYGN_PER_BLOCK));
    expect(ygnConverter).to.equal(this.feeAddress);
    expect(isRewardManagerEnabled).to.equal(false);
    expect(rewardManager).to.equal(AddressZero);
    expect(owner).to.equal(this.signer.address);
    expect(totalAllocPoint).to.equal(Number(100));
    expect(await this.farmInstance.poolLength()).to.equal(Number(1));

    expect(poolInfo0.lpToken).to.equal(this.assetTokenInstance.address);
    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo0.harvestInterval).to.equal(Number(300));
    expect(poolInfo0.strategy).to.equal(this.tarotSupplyVaultStrategyInstance.address);
  });

  it("should correctly update pool alloc point", async function () {
    await this.farmInstance.updatePoolAllocPoint(0, 200, true);
    const poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.allocPoint).to.equal(String(200));
  });

  it("should correctly update ygn converter", async function () {
    await this.farmInstance.setYGNConverter(this.feeAddress);
    const ygnConverter = await this.farmInstance.ygnConverter();
    expect(ygnConverter).to.equal(this.feeAddress);
  });

  it("should correctly update pool withdrawal fee", async function () {
    await this.farmInstance.updatePoolWithdrawalFeeBP(0, 200, true);
    let poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(200));
    await this.farmInstance.updatePoolWithdrawalFeeBP(0, 0, true);
    poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
  });

  it("should correctly update pool harvest interval", async function () {
    await this.farmInstance.updatePoolHarvestInterval(0, 200, true);
    const poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.harvestInterval).to.equal(String(200));
  });

  it("should correctly set the pool config", async function () {
    await this.farmInstance.set(0, 100, 0, 300, true);
    const poolInfo0 = await this.farmInstance.poolInfo(0);
    const totalAllocPoint = await this.farmInstance.totalAllocPoint();
    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo0.harvestInterval).to.equal(String(300));
    expect(totalAllocPoint).to.equal(Number(100));
  });

  it("should pause deposit/withdraw when contract is paused", async function () {
    await this.farmInstance.pause();
    const depositAmount = getBigNumber(5);
    await expect(
      this.ftmWrapperInstance.connect(this.depositor).depositToFarm(0, depositAmount, true, {
        value: depositAmount,
      })
    ).to.be.revertedWith("Pausable: paused");
    await this.assetTokenInstance
      .connect(this.depositor)
      .approve(this.farmInstance.address, MaxUint256);
    await expect(
      this.farmInstance.connect(this.depositor).deposit(0, depositAmount, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance.connect(this.depositor).withdraw(0, depositAmount, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance
        .connect(this.depositor)
        .depositFor(0, depositAmount, this.depositor.address, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance
        .connect(this.depositor)
        .withdrawFor(0, depositAmount, this.depositor.address, false)
    ).to.be.revertedWith("Pausable: paused");
    await this.farmInstance.unpause();
  });

  it("should correctly deposit in tarot supply vault strategy", async function () {
    console.log(
      `FTM Balance for the user before deposit - `,
      await this.provider.getBalance(this.depositor.address)
    );
    this.depositAmount = getBigNumber(5);
    await this.ftmWrapperInstance
      .connect(this.depositor)
      .depositToFarm(0, this.depositAmount, true, {
        value: this.depositAmount,
      });
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let totalInputTokensStakedInStrategy = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount);
    expect(totalInputTokensStakedInStrategy).to.equal(this.depositAmount);
    expect(totalInputTokensStaked).to.equal(this.depositAmount);
    console.log(
      `FTM Balance for the user after deposit - `,
      await this.provider.getBalance(this.depositor.address)
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
    expect(await this.farmInstance.pendingFYGN(0, this.depositor.address)).to.equal(
      getBigNumber(5)
    );
    expect(await this.farmInstance.canHarvest(0, this.depositor.address)).to.equal(true);
    expect(await this.assetTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
  });

  it("should harvest fYGN rewards for the user", async function () {
    //checking harvest by deposit 0
    await this.farmInstance.connect(this.depositor).deposit(0, 0, false);
    this.fYGNBalanceAfterHarvest = String(
      await this.fygnTokenInstance.balanceOf(this.depositor.address)
    );
    console.log("fYGN Balance after harvest", this.fYGNBalanceAfterHarvest);
    expect(Number(this.fYGNBalanceAfterHarvest)).to.be.greaterThan(Number(0));
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let totalInputTokensStakedInStrategy = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount);
    expect(totalInputTokensStakedInStrategy).to.equal(this.depositAmount);
    expect(totalInputTokensStaked).to.equal(this.depositAmount);
    expect(Number(userInfo.rewardDebt)).to.be.greaterThan(Number(0));
  });

  it("should withdraw asset and claim rewards", async function () {
    await this.farmInstance.connect(this.depositor).withdraw(0, this.depositAmount.div(2), false);
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount.div(2));
    expect(lpSupply).to.equal(this.depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(this.depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(0, this.depositor.address)).to.equal(
      getBigNumber(1)
    );
    expect((await this.fygnTokenInstance.balanceOf(this.depositor.address)) / 10 ** 18).to.equal(
      Number(6)
    );
    expect(await this.assetTokenInstance.balanceOf(this.feeAddress)).gt(0);
    console.log(
      "asset balance in converter : ",
      await this.assetTokenInstance.balanceOf(this.feeAddress)
    );
  });

  it("should execute emergency withdraw from staking pool", async function () {
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(0);
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(
      parseEther("6")
    );
    expect(Number(await this.assetTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    console.log(
      `Final FTM Balance for the user - `,
      await this.provider.getBalance(this.depositor.address)
    );
  });

  it("should disable strategy to rescue funds and handle deposit/withdraw etc.", async function () {
    //New deposit
    await this.ftmWrapperInstance
      .connect(this.depositor)
      .depositToFarm(0, this.depositAmount, true, {
        value: this.depositAmount,
      });
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let totalInputTokensStakedInStrategy = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount);
    expect(totalInputTokensStakedInStrategy).to.equal(this.depositAmount);
    expect(totalInputTokensStaked).to.equal(this.depositAmount);

    //Calling Rescue Funds
    await this.tarotSupplyVaultStrategyInstance.rescueFunds(this.assetTokenInstance.address);
    for (let i = 0; i < 10; i++) {
      advanceTime(60);
      advanceBlock();
    }
    await expect(
      this.ftmWrapperInstance.connect(this.depositor).depositToFarm(0, this.depositAmount, false, {
        value: this.depositAmount,
      })
    ).to.be.revertedWith("Strategy is disabled");

    //withdraw
    await this.farmInstance.connect(this.depositor).withdraw(0, this.depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(this.depositAmount.div(2));
    expect(lpSupply).to.equal(this.depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(this.depositAmount.div(2));

    //emergency withdraw
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(0);
    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(
      parseEther("19")
    );
    expect(Number(await this.assetTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
  });
});
