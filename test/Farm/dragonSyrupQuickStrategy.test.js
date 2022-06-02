const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const { getBigNumber } = require("../utilities/index");
const { advanceBlock, advanceTime } = require("../utilities/time");
const QuickSwapDragonStrategyParams = require("../../scripts/quick_swap_dragon_syrup_strategy.json");
const { parseEther } = require("ethers/lib/utils");
const FYGN_PER_BLOCK = "1000000000000000000";

describe("Yugen Farm Contract with QUICK Token", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.feeAddress = QuickSwapDragonStrategyParams.ygnConverter;

    const FYGN = await ethers.getContractFactory("FYGN");
    this.fygnTokenInstance = await FYGN.deploy("Farm YUGEN", "FYGN");
    console.log("FYGN Token Deployed at", this.fygnTokenInstance.address);

    const latestBlock = await hre.ethers.provider.getBlock("latest");
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

    //Reward Tokens pairing
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.assetToken = this.ERC20Mock.attach(QuickSwapDragonStrategyParams.asset);
    this.rewardToken = this.ERC20Mock.attach(QuickSwapDragonStrategyParams.rewardToken);

    console.log(
      `Reward Token is ${await this.rewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );

    //adding child farms to yugen
    await this.farmInstance.add(
      100,
      this.assetToken.address,
      0,
      300,
      this.quickSwapDragonSyrupQuickStrategyInstance.address,
      true
    );

    const depositor = "0x10855704d1Dde09d90C0D1afEe4E1e6626e45Bb7";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [depositor],
    });
    this.depositor = await ethers.getSigner(depositor);

    console.log(
      "Asset balance for depositor before flow",
      await this.assetToken.balanceOf(this.depositor.address)
    );
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

    expect(poolInfo0.lpToken).to.equal(this.assetToken.address);
    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo0.harvestInterval).to.equal(Number(300));
    expect(poolInfo0.strategy).to.equal(this.quickSwapDragonSyrupQuickStrategyInstance.address);
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
    const depositAmount = parseEther("10");
    await this.assetToken.connect(this.depositor).approve(this.farmInstance.address, MaxUint256);
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

  it("should correctly deposit and withdraw in quickswap dragon syrup farms", async function () {
    const depositAmount = parseEther("10");
    await this.assetToken.connect(this.depositor).approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.connect(this.depositor).deposit(0, depositAmount, false);
    console.log("Deposit completed");
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }

    expect(await this.farmInstance.pendingFYGN(0, this.depositor.address)).to.equal(
      getBigNumber(5)
    );
    expect(await this.farmInstance.canHarvest(0, this.depositor.address)).to.equal(true);
    expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(Number(0));
    expect(await this.rewardToken.balanceOf(this.feeAddress)).to.equal(Number(0));

    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    await this.farmInstance.connect(this.depositor).withdraw(0, depositAmount.div(2), false);
    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;

    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(0, this.depositor.address)).to.equal(
      getBigNumber(0)
    );
    expect((await this.fygnTokenInstance.balanceOf(this.depositor.address)) / 10 ** 18).to.equal(
      Number(6)
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
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(0);

    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;

    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(
      parseEther("6")
    );
    expect(Number(await this.rewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    await this.fygnTokenInstance.connect(this.depositor).transfer(this.feeAddress, parseEther("6"));
    await expect(
      this.farmInstance.connect(this.depositor).deposit(0, depositAmount, false)
    ).to.be.revertedWith("Strategy is disabled");

    console.log(
      "Asset balance for depositor after flow",
      await this.assetToken.balanceOf(this.depositor.address)
    );

    await this.quickSwapDragonSyrupQuickStrategyInstance.updateStrategyMode(true);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Deploying new strategy (This is also quick token dragon syrup strategy)

    //Bico Token
    this.newRewardToken = this.ERC20Mock.attach("0x5314bA045a459f63906Aa7C76d9F337DcB7d6995");
    this.newStakingRewardsContract = "0xFc80C8817405f7D7a345051a47EC457ED0080664";

    console.log(
      `New Reward Token is ${await this.newRewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );

    //Depositing in old strategy.
    await this.farmInstance.connect(this.depositor).deposit(0, parseEther("10"), false);
    await this.farmInstance.connect(this.depositor).deposit(0, parseEther("7"), false);

    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance.switchStrategy(
      this.newStakingRewardsContract,
      this.newRewardToken.address
    );

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly deposit and withdraw in new quickswap dragon syrup farms", async function () {
    const depositAmount = parseEther("20");
    expect(await this.newRewardToken.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.connect(this.depositor).deposit(0, parseEther("3"), false);
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }

    expect(await this.farmInstance.canHarvest(0, this.depositor.address)).to.equal(true);
    expect(await this.fygnTokenInstance.balanceOf(this.depositor.address)).to.equal(Number(0));

    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    await this.farmInstance.connect(this.depositor).withdraw(0, depositAmount.div(2), false);
    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;

    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(0, this.depositor.address)).to.equal(
      getBigNumber(0)
    );
    expect(await this.newRewardToken.balanceOf(this.feeAddress)).gt(0);

    console.log("reward token balance : ", await this.newRewardToken.balanceOf(this.feeAddress));
    for (let i = 0; i < 10; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.newRewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    advanceTime(300);
    advanceBlock();
    advanceBlock();

    await this.quickSwapDragonSyrupQuickStrategyInstance.rescueFunds(this.assetToken.address);
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(0);

    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;

    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(Number(await this.newRewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    await expect(
      this.farmInstance.connect(this.depositor).deposit(0, depositAmount, false)
    ).to.be.revertedWith("Strategy is disabled");

    console.log(
      "Asset balance for depositor after flow",
      await this.assetToken.balanceOf(this.depositor.address)
    );
    await this.quickSwapDragonSyrupQuickStrategyInstance.updateStrategyMode(true);
  });

  it("should correctly switch strategy and deposit in new strategy", async function () {
    //Deploying new strategy (This is also quick token dragon syrup strategy)

    //Bico Token
    this.newRewardToken = this.ERC20Mock.attach("0xf4C83080E80AE530d6f8180572cBbf1Ac9D5d435");
    this.newStakingRewardsContract = "0x834a43bb0e9a208139497ea9da005a7973903421";

    console.log(
      `New Reward Token is ${await this.newRewardToken.symbol()} and Asset Token is ${await this.assetToken.symbol()}`
    );

    //Depositing in old strategy.
    await this.farmInstance.connect(this.depositor).deposit(0, parseEther("10"), false);
    await this.farmInstance.connect(this.depositor).deposit(0, parseEther("7"), false);

    //Calling Switch Strategy Flow

    await this.quickSwapDragonSyrupQuickStrategyInstance.switchStrategy(
      this.newStakingRewardsContract,
      this.newRewardToken.address
    );

    const totalDepositAmount = parseEther("17");
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    let totalInputTokensStakedInStrategy =
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked();
    expect(userInfo.amount).to.equal(totalDepositAmount);
    expect(lpSupply).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalDepositAmount);
    expect(totalInputTokensStaked).to.equal(totalInputTokensStakedInStrategy);
  });

  it("should correctly deposit and withdraw in new quickswap dragon syrup farms", async function () {
    const depositAmount = parseEther("20");
    expect(await this.newRewardToken.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.connect(this.depositor).deposit(0, parseEther("3"), false);
    let userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);

    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }

    expect(await this.farmInstance.canHarvest(0, this.depositor.address)).to.equal(true);

    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    await this.farmInstance.connect(this.depositor).withdraw(0, depositAmount.div(2), false);
    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log(
      "LP in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.getTotalLPStaked()
    );
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapDragonSyrupQuickStrategyInstance.totalInputTokensStaked()
    );

    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;

    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(0, this.depositor.address)).to.equal(
      getBigNumber(0)
    );
    expect(await this.newRewardToken.balanceOf(this.feeAddress)).gt(0);

    console.log("reward token balance : ", await this.newRewardToken.balanceOf(this.feeAddress));
    for (let i = 0; i < 10; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.newRewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    advanceTime(300);
    advanceBlock();
    advanceBlock();

    await this.quickSwapDragonSyrupQuickStrategyInstance.rescueFunds(this.assetToken.address);
    await this.farmInstance.connect(this.depositor).emergencyWithdraw(0);

    userInfo = await this.farmInstance.userInfo(0, this.depositor.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;

    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(Number(await this.newRewardToken.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    await expect(
      this.farmInstance.connect(this.depositor).deposit(0, depositAmount, false)
    ).to.be.revertedWith("Strategy is disabled");

    console.log(
      "Asset balance for depositor after flow",
      await this.assetToken.balanceOf(this.depositor.address)
    );
  });
});
