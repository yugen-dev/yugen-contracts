const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const { getBigNumber } = require("../utilities/index");
const { advanceBlock, advanceTime } = require("../utilities/time");
const ERC20TokensSupply = getBigNumber(10 ** 6);
const QuickSwapDualStrategyParams = require("../../scripts/quick_swap_farms_dual_strategy.json");
const QuickSwapStrategyParams = require("../../scripts/quick_swap_farms_strategy.json");
const SushiSwapStrategyParams = require("../../scripts/sushi_swap_farms_strategy.json");
const NachoXYZStrategyParams = require("../../scripts/nacho_xyz_strategy.json");
const { parseEther } = require("ethers/lib/utils");

const FYGN_PER_BLOCK = "1000000000000000000";

describe("Yugen Farm Contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.adminAddress = this.signer.address;
    this.feeCollector = this.signers[1];
    this.feeAddress = "0x61e2A077a8Baae0ffb7d7bA7792d7FE921995bfB";

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

    const QuickSwapFarmsStrategy = await hre.ethers.getContractFactory("QuickSwapFarmsStrategy");
    this.quickSwapFarmsStrategyInstance = await QuickSwapFarmsStrategy.deploy(
      QuickSwapStrategyParams.asset,
      QuickSwapStrategyParams.rewardToken,
      QuickSwapStrategyParams.stakingRewardsContract,
      this.feeAddress,
      this.farmInstance.address,
      QuickSwapStrategyParams.quickTokenAddress
    );
    await this.quickSwapFarmsStrategyInstance.deployed();
    console.log(
      "QuickSwapFarmsStrategy deployed at " + this.quickSwapFarmsStrategyInstance.address
    );

    const lpToken1 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken1Instance = lpToken1.attach(QuickSwapStrategyParams.asset);

    //Reward Tokens pairing

    const QuickToken = await ethers.getContractFactory("ERC20Mock");
    this.quickTokenInstance = QuickToken.attach(QuickSwapStrategyParams.quickTokenAddress);

    //adding child farms to yugen
    await this.farmInstance.add(
      100,
      this.lpToken1Instance.address,
      0,
      300,
      this.quickSwapFarmsStrategyInstance.address,
      true
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
    expect(owner).to.equal(this.adminAddress);
    expect(totalAllocPoint).to.equal(Number(100));
    expect(await this.farmInstance.poolLength()).to.equal(Number(1));

    expect(poolInfo0.lpToken).to.equal(this.lpToken1Instance.address);
    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo0.harvestInterval).to.equal(Number(300));
    expect(poolInfo0.strategy).to.equal(this.quickSwapFarmsStrategyInstance.address);
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
    let user = "0xc04daf3df8b917afa96fd41a1c5d6dbc23aad3d7";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);

    const depositAmount = getBigNumber(1, 16);
    await this.lpToken1Instance.connect(signer).approve(this.farmInstance.address, MaxUint256);
    await expect(
      this.farmInstance.connect(signer).deposit(0, depositAmount, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance.connect(signer).withdraw(0, depositAmount, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance.connect(signer).depositFor(0, depositAmount, signer.address, false)
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      this.farmInstance.connect(signer).withdrawFor(0, depositAmount, signer.address, false)
    ).to.be.revertedWith("Pausable: paused");
    await this.farmInstance.unpause();
  });

  it("should correctly deposit and withdraw in quickswap dual rewards farms", async function () {
    let user = "0xc04daf3df8b917afa96fd41a1c5d6dbc23aad3d7";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);
    const depositAmount = parseEther("0.001");

    console.log("depositAmount ", String(depositAmount));
    await this.lpToken1Instance.connect(signer).approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.connect(signer).deposit(0, depositAmount, false);
    console.log("Deposit completed");
    // await this.farmInstance.connect(signer).deposit(0, depositAmount false);
    let userInfo = await this.farmInstance.userInfo(0, signer.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farmInstance.pendingFYGN(0, signer.address)).to.equal(getBigNumber(5));
    expect(await this.farmInstance.canHarvest(0, signer.address)).to.equal(true);
    //Initial FYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(Number(0));
    //Initial QUICK and WMATIC Balance in ygn converter
    expect(await this.quickTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log("LP in Protocol", await this.quickSwapFarmsStrategyInstance.getTotalLPStaked());
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapFarmsStrategyInstance.totalInputTokensStaked()
    );

    await this.farmInstance.connect(signer).withdraw(0, depositAmount.div(2), false);
    console.log(
      "Total Input Tokens Staked in Farms",
      (await this.farmInstance.poolInfo(0)).totalInputTokensStaked
    );
    console.log("LP in Protocol", await this.quickSwapFarmsStrategyInstance.getTotalLPStaked());
    console.log(
      "Total Input Tokens Staked in Protocol",
      await this.quickSwapFarmsStrategyInstance.totalInputTokensStaked()
    );
    userInfo = await this.farmInstance.userInfo(0, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(0, signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(signer.address)) / 10 ** 18).to.equal(Number(6));
    //After reward token Balance in ygn converter
    console.log("quick balance : ", await this.quickTokenInstance.balanceOf(this.feeAddress));
    expect(await this.quickTokenInstance.balanceOf(this.feeAddress)).gt(0);
    for (let i = 0; i < 10; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.quickTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    advanceTime(300);
    advanceBlock();
    advanceBlock();

    await this.quickSwapFarmsStrategyInstance.rescueFunds(this.lpToken1Instance.address);

    await this.farmInstance.connect(signer).emergencyWithdraw(0);
    userInfo = await this.farmInstance.userInfo(0, signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(userInfo.amount).to.equal(getBigNumber(0));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(parseEther("6"));
    //After QUICK Balance in ygn converter
    expect(Number(await this.quickTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    await this.fygnTokenInstance.connect(signer).transfer(this.feeAddress, parseEther("6"));
    await expect(
      this.farmInstance.connect(signer).deposit(0, depositAmount, false)
    ).to.be.revertedWith("Strategy is disabled");
  });
});
