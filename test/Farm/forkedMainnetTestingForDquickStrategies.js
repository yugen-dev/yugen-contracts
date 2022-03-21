const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256 } = ethers.constants;
const { getBigNumber } = require("../utilities/index");
const { advanceBlock, advanceTime } = require("../utilities/time");
const QuickSwapDragonStrategyParams = require("../../scripts/quick_swap_dragon_syrup_strategy.json");
const { parseEther } = require("ethers/lib/utils");

describe.only("Forked Mainnet Testing - Dragon Syrup Pools - Yugen Farm Contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.feeAddress = QuickSwapDragonStrategyParams.ygnConverter;

    const Farm = await ethers.getContractFactory("Farm");
    this.farmInstance = Farm.attach(QuickSwapDragonStrategyParams.farm);

    const FYGN = await ethers.getContractFactory("FYGN");
    this.fygnTokenInstance = FYGN.attach("0x397e10ee5e315f69b23cb6c8a913a589b5850c80");

    this.deployerAddress = "0x820De2eb0EE8007Ee237E02aCe3BF2b9cD0DdF1a";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [this.deployerAddress],
    });
    this.deployer = await ethers.getSigner(this.deployerAddress);

    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.assetToken = this.ERC20Mock.attach(QuickSwapDragonStrategyParams.asset);
    this.rewardToken = this.ERC20Mock.attach(QuickSwapDragonStrategyParams.rewardToken);

    const QuickSwapDragonSyrupStrategy = await hre.ethers.getContractFactory(
      "QuickSwapDragonSyrupStrategy"
    );
    this.quickSwapDragonSyrupQuickStrategyInstance = await QuickSwapDragonSyrupStrategy.deploy(
      QuickSwapDragonStrategyParams.asset,
      QuickSwapDragonStrategyParams.rewardToken,
      QuickSwapDragonStrategyParams.stakingRewardsContract,
      this.feeAddress,
      this.farmInstance.address
    );

    await this.quickSwapDragonSyrupQuickStrategyInstance.deployed();
    console.log(
      "QuickSwapFarmsStrategy deployed at " + this.quickSwapDragonSyrupQuickStrategyInstance.address
    );

    console.log(
      `Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );

    //adding child farms to yugen
    await this.farmInstance
      .connect(this.deployer)
      .add(
        100,
        this.assetToken.address,
        0,
        300,
        this.quickSwapDragonSyrupQuickStrategyInstance.address,
        true
      );

    const depositor = "0xf977814e90da44bfa03b6295a0616a897441acec";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [depositor],
    });
    this.depositor = await ethers.getSigner(depositor);
    this.newFarmPid = 16;

    await this.assetToken.connect(this.depositor).approve(this.farmInstance.address, MaxUint256);

    console.log(
      `Asset Balance for the user before deposit - `,
      await this.assetToken.balanceOf(this.depositor.address)
    );
  });

  it("should set correct state variables", async function () {
    const poolInfo12 = await this.farmInstance.poolInfo(this.newFarmPid);
    expect(poolInfo12.lpToken).to.equal(this.assetToken.address);
    expect(poolInfo12.allocPoint).to.equal(String(100));
    expect(poolInfo12.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo12.harvestInterval).to.equal(Number(300));
    expect(poolInfo12.strategy).to.equal(this.quickSwapDragonSyrupQuickStrategyInstance.address);
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
    const depositAmount = getBigNumber(10);
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
    this.depositAmount = parseEther("10");
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
    expect(await this.farmInstance.canHarvest(this.newFarmPid, this.depositor.address)).to.equal(
      true
    );
    expect(await this.rewardToken.balanceOf(this.feeAddress)).to.equal(Number(0));
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
    expect(await this.rewardToken.balanceOf(this.feeAddress)).gt(0);
    console.log(` Reward Token is ${await this.rewardToken.symbol()}`);
    console.log(
      "reward token balance in converter : ",
      await this.rewardToken.balanceOf(this.feeAddress)
    );
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
    expect(Number(await this.rewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    console.log(
      `Final Asset Balance for the user - `,
      await this.assetToken.balanceOf(this.depositor.address)
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
    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .rescueFunds(this.assetToken.address);
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
    expect(Number(await this.rewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .updateStrategyMode(true);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Bico Token
    this.rewardToken = this.ERC20Mock.attach("0xB382C1cfA622795a534e5bd56Fac93d59BAc8B0D");
    this.stakingRewardsContract = "0xB68842d78ef33C2b327f863D0E0e293C81d7a243";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );

    //Depositing in old strategy.
    await this.farmInstance
      .connect(this.depositor)
      .deposit(this.newFarmPid, parseEther("10"), false);
    await this.farmInstance
      .connect(this.depositor)
      .deposit(this.newFarmPid, parseEther("7"), false);

    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly deposit and withdraw in new quickswap dragon syrup farms", async function () {
    const depositAmount = parseEther("20");
    expect(await this.rewardToken.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance
      .connect(this.depositor)
      .deposit(this.newFarmPid, parseEther("3"), false);
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }

    expect(await this.farmInstance.canHarvest(this.newFarmPid, this.depositor.address)).to.equal(
      true
    );

    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(this.newFarmPid)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    await this.farmInstance
      .connect(this.depositor)
      .withdraw(this.newFarmPid, depositAmount.div(2), false);
    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(this.newFarmPid)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;

    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(this.newFarmPid, this.depositor.address)).to.equal(
      getBigNumber(0)
    );
    expect(await this.rewardToken.balanceOf(this.feeAddress)).gt(0);

    console.log("reward token balance : ", await this.rewardToken.balanceOf(this.feeAddress));
    for (let i = 0; i < 10; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.rewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    advanceTime(300);
    advanceBlock();
    advanceBlock();

    await this.quickSwapDragonSyrupQuickStrategyInstance.rescueFunds(this.assetToken.address);
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(this.newFarmPid);

    userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;

    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(Number(await this.rewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    await expect(
      this.farmInstance.connect(this.depositor).deposit(this.newFarmPid, depositAmount, false)
    ).to.be.revertedWith("Strategy is disabled");

    console.log(
      "Asset balance for depositor after flow",
      await this.assetToken.balanceOf(this.depositor.address)
    );
    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .updateStrategyMode(true);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Fuse Token
    this.rewardToken = this.ERC20Mock.attach("0xF915fDDa4c882731C0456a4214548Cd13A822886");
    this.stakingRewardsContract = "0xF2f0eadC00FE2009B64D5B735F0F06B45C502D15";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );

    //Depositing in old strategy.
    await this.farmInstance
      .connect(this.depositor)
      .deposit(this.newFarmPid, parseEther("10"), false);
    await this.farmInstance
      .connect(this.depositor)
      .deposit(this.newFarmPid, parseEther("7"), false);

    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Derc Token
    this.rewardToken = this.ERC20Mock.attach("0xB35fcBCF1fD489fCe02Ee146599e893FDCdC60e6");
    this.stakingRewardsContract = "0x09ecE0A8fF76AEa30d82480E8a89ec9fEeca9B0F";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //kiro Token
    this.rewardToken = this.ERC20Mock.attach("0xB382C1cfA622795a534e5bd56Fac93d59BAc8B0D");
    this.stakingRewardsContract = "0xB68842d78ef33C2b327f863D0E0e293C81d7a243";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Derc Token
    this.rewardToken = this.ERC20Mock.attach("0xdF7837DE1F2Fa4631D716CF2502f8b230F1dcc32");
    this.stakingRewardsContract = "0xcC6Cc4e642c889742278CF302d5276E7eF498d66";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //kiro Token
    this.rewardToken = this.ERC20Mock.attach("0xE8A05E85883F9663b18a38d7aa89853deaba56e3");
    this.stakingRewardsContract = "0x297F1d28a886dBc513C43A3BC39Dd6F3c4969378";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  //qweqweqweqweqwewqw

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Derc Token
    this.rewardToken = this.ERC20Mock.attach("0x8d520c8E66091cfD6743fe37Fbe3A09505616C4b");
    this.stakingRewardsContract = "0xA518cca4891e274DD85bDCc47ce8191bccA19854";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //kiro Token
    this.rewardToken = this.ERC20Mock.attach("0xEe9A352F6aAc4aF1A5B9f467F6a93E0ffBe9Dd35");
    this.stakingRewardsContract = "0x84dc01625a2ACAc0eb58776869e0F8BFb018D2fB";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Derc Token
    this.rewardToken = this.ERC20Mock.attach("0x3C1BB39bb696B443a1D80BB2b3a3d950Ba9DEE87");
    this.stakingRewardsContract = "0xB7070622F36e01A8f1B0eCc14c41553965BdD053";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //kiro Token
    this.rewardToken = this.ERC20Mock.attach("0x5CEeBB0947d58Fabde2fc026Ffe4B33ccFE1bA8B");
    this.stakingRewardsContract = "0x5bF3A873F3ac58644df59B990E663810e212955f";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //kiro Token
    this.rewardToken = this.ERC20Mock.attach("0x2bC07124D8dAc638E290f401046Ad584546BC47b");
    this.stakingRewardsContract = "0xeEf2D69bd3aeDd1bd770d67E9B9A3C58a1267e50";

    console.log(
      `New Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );
    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance
      .connect(this.signer)
      .switchStrategy(this.stakingRewardsContract, this.rewardToken.address);

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(this.newFarmPid, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(this.newFarmPid);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(this.newFarmPid))
      .totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });
});
