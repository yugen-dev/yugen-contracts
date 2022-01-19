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
const NachoXYZETHStrategyParams = require("../../scripts/nacho_xyz_eth_strategy.json");
const CafeSwapStrategyParams = require("../../scripts/cafeswap_strategy.json");
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

    // //Deploying QuickSwap Strategy

    // const QuickSwapFarmsStrategy = await hre.ethers.getContractFactory("QuickSwapFarmsStrategy");
    // this.quickSwapFarmsStrategyInstance = await QuickSwapFarmsStrategy.deploy(
    //   QuickSwapStrategyParams.asset,
    //   QuickSwapStrategyParams.rewardToken,
    //   QuickSwapStrategyParams.stakingRewardsContract,
    //   this.feeAddress,
    //   this.farmInstance.address,
    //   QuickSwapStrategyParams.quickTokenAddress
    // );
    // await this.quickSwapFarmsStrategyInstance.deployed();
    // console.log("QuickSwapDualFarms deployed at " + this.quickSwapFarmsStrategyInstance.address);

    const FarmWrapper = await ethers.getContractFactory('FarmWrapper');

    this.farmWrapperInstance = await FarmWrapper.deploy(
      NachoXYZETHStrategyParams.universalOneSidedFarm,
      NachoXYZETHStrategyParams.nachoLP,
      NachoXYZETHStrategyParams.quickSwapRouter,
      NachoXYZETHStrategyParams.asset,
      NachoXYZETHStrategyParams.secondaryAsset,
      this.farmInstance.address
    );

    //Deploying QuickSwap Dual Strategy

    const QuickSwapFarmsStrategyDual = await hre.ethers.getContractFactory(
      "QuickSwapFarmsStrategyDual"
    );
    this.quickSwapFarmsStrategyDualInstance = await QuickSwapFarmsStrategyDual.deploy(
      QuickSwapDualStrategyParams.asset,
      QuickSwapDualStrategyParams.rewardTokenA,
      QuickSwapDualStrategyParams.rewardTokenB,
      QuickSwapDualStrategyParams.quickTokenAddress,
      QuickSwapDualStrategyParams.stakingRewardsContract,
      this.feeAddress,
      this.farmInstance.address
    );
    await this.quickSwapFarmsStrategyDualInstance.deployed();
    console.log(
      "QuickSwapDualFarmsDual deployed at " + this.quickSwapFarmsStrategyDualInstance.address
    );

    const CafeSwapStrategy = await hre.ethers.getContractFactory("CafeSwapStrategy");
    this.cafeSwapStrategyInstance = await CafeSwapStrategy.deploy(
      CafeSwapStrategyParams.asset,
      CafeSwapStrategyParams.rewardToken,
      CafeSwapStrategyParams.masterChefContract,
      this.feeAddress,
      this.farmInstance.address,
      CafeSwapStrategyParams.pid
    );
    await this.cafeSwapStrategyInstance.deployed();
    console.log("Cafeswap deployed at " + this.cafeSwapStrategyInstance.address);

    //SushiSwap Strategy

    const SushiSwapFarmsStrategy = await hre.ethers.getContractFactory("SushiSwapFarmsStrategy");
    this.sushiSwapFarmsStrategyInstance = await SushiSwapFarmsStrategy.deploy(
      SushiSwapStrategyParams.asset,
      SushiSwapStrategyParams.rewardToken,
      SushiSwapStrategyParams.wmatic,
      SushiSwapStrategyParams.miniChefContract,
      this.feeAddress,
      this.farmInstance.address,
      SushiSwapStrategyParams.pid
    );
    await this.sushiSwapFarmsStrategyInstance.deployed();
    console.log(
      "SushiSwapFarmsStrategy deployed at " + this.sushiSwapFarmsStrategyInstance.address
    );

    //NachoXYZ Strategy (testing for wmatic and nacho)

    const NachoXYZStrategy = await hre.ethers.getContractFactory("NachoXYZStrategy");
    this.nachoXYZStrategyInstance = await NachoXYZStrategy.deploy(
      NachoXYZStrategyParams.asset,
      NachoXYZStrategyParams.rewardToken,
      NachoXYZStrategyParams.masterChefContract,
      this.feeAddress,
      this.farmInstance.address,
      NachoXYZStrategyParams.pid
    );
    await this.nachoXYZStrategyInstance.deployed();
    console.log("NachoXYZStrategy deployed at " + this.nachoXYZStrategyInstance.address);

    // Nacho ETH strategy
    const NachoXYZETHStrategy = await hre.ethers.getContractFactory("NachoXYZStrategy");
    this.nachoXYZETHStrategyInstance = await NachoXYZETHStrategy.deploy(
      NachoXYZETHStrategyParams.nachoLP,
      NachoXYZETHStrategyParams.rewardToken,
      NachoXYZETHStrategyParams.masterChefContract,
      this.feeAddress,
      this.farmInstance.address,
      NachoXYZETHStrategyParams.pid,
    );
    await this.nachoXYZETHStrategyInstance.deployed();
    console.log("NachoXYZETHStrategy deployed at " + this.nachoXYZETHStrategyInstance.address);

    const lpToken1 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken1Instance = lpToken1.attach(QuickSwapDualStrategyParams.asset);

    const lpToken2 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken2Instance = lpToken2.attach(SushiSwapStrategyParams.asset);

    const lpToken3 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken3Instance = lpToken3.attach(NachoXYZStrategyParams.asset);

    const lpToken4 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken4Instance = lpToken4.attach(NachoXYZETHStrategyParams.asset);

    const NachoFarm = await ethers.getContractFactory("NachoFarm");
    this.nachoFarmInstance = NachoFarm.attach(NachoXYZETHStrategyParams.masterChefContract);
    console.log('total alloc point ', await this.nachoFarmInstance.totalAllocPoint());
    this.lpToken4Instance = lpToken4.attach(CafeSwapStrategyParams.asset);

    //Reward Tokens pairing

    const WMATICToken = await ethers.getContractFactory("ERC20Mock");
    this.wmaticTokenInstance = WMATICToken.attach(SushiSwapStrategyParams.wmatic);

    const QuickToken = await ethers.getContractFactory("ERC20Mock");
    this.quickTokenInstance = QuickToken.attach(QuickSwapDualStrategyParams.quickTokenAddress);

    const SushiToken = await ethers.getContractFactory("ERC20Mock");
    this.sushiTokenInstance = SushiToken.attach(SushiSwapStrategyParams.rewardToken);

    const NShareToken = await ethers.getContractFactory("ERC20Mock");
    this.nshareTokenInstance = NShareToken.attach(NachoXYZStrategyParams.rewardToken);

    // const NShareToken = await ethers.getContractFactory("ERC20Mock");
    // this.nshareTokenInstance = NShareToken.attach(NachoXYZETHStrategyParams.rewardToken);
    // for Cafeswap
    const BrewShareToken = await ethers.getContractFactory("ERC20Mock");
    this.brewShareTokenInstance = BrewShareToken.attach(CafeSwapStrategyParams.rewardToken);

    //adding child farms to yugen
    await this.farmInstance.add(
      100,
      this.lpToken1Instance.address,
      0,
      300,
      this.quickSwapFarmsStrategyDualInstance.address,
      true
    );

    await this.farmInstance.add(
      200,
      this.lpToken2Instance.address,
      0,
      300,
      this.sushiSwapFarmsStrategyInstance.address,
      true
    );

    // await this.farmInstance.add(
    //   100,
    //   this.lpToken3Instance.address,
    //   0,
    //   300,
    //   this.nachoXYZStrategyInstance.address,
    //   true
    // );

    await this.farmInstance.add(
      100,
      this.lpToken4Instance.address,
      0,
      300,
      this.cafeSwapStrategyInstance.address,
      true
    );

    await this.farmInstance.add(
      100,
      NachoXYZETHStrategyParams.nachoLP,
      0,
      300,
      this.nachoXYZETHStrategyInstance.address,
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
    const poolInfo1 = await this.farmInstance.poolInfo(1);
    const poolInfo2 = await this.farmInstance.poolInfo(2);

    expect(fygn).to.equal(this.fygnTokenInstance.address);
    expect(fYGNPerBlock).to.equal(String(FYGN_PER_BLOCK));
    expect(ygnConverter).to.equal(this.feeAddress);
    expect(isRewardManagerEnabled).to.equal(false);
    expect(rewardManager).to.equal(AddressZero);
    expect(owner).to.equal(this.adminAddress);
    expect(totalAllocPoint).to.equal(Number(400));
    expect(await this.farmInstance.poolLength()).to.equal(Number(3));

    expect(poolInfo0.lpToken).to.equal(this.lpToken1Instance.address);
    expect(poolInfo1.lpToken).to.equal(this.lpToken2Instance.address);
    // expect(poolInfo2.lpToken).to.equal(this.lpToken3Instance.address);
    expect(poolInfo2.lpToken).to.equal(NachoXYZETHStrategyParams.nachoLP);

    expect(await this.farmInstance.activeLpTokens(this.lpToken1Instance.address)).to.equal(true);
    expect(await this.farmInstance.activeLpTokens(this.lpToken2Instance.address)).to.equal(true);
    expect(await this.farmInstance.activeLpTokens(NachoXYZETHStrategyParams.nachoLP)).to.equal(true);

    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo1.allocPoint).to.equal(String(200));
    expect(poolInfo2.allocPoint).to.equal(String(100));

    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo1.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo2.withdrawalFeeBP).to.equal(Number(0));

    expect(poolInfo0.harvestInterval).to.equal(Number(300));
    expect(poolInfo1.harvestInterval).to.equal(Number(300));
    expect(poolInfo2.harvestInterval).to.equal(Number(300));

    expect(poolInfo0.strategy).to.equal(this.quickSwapFarmsStrategyDualInstance.address);
    expect(poolInfo1.strategy).to.equal(this.sushiSwapFarmsStrategyInstance.address);
    expect(poolInfo2.strategy).to.equal(this.nachoXYZETHStrategyInstance.address);
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
    expect(totalAllocPoint).to.equal(Number(400));
  });

  it("should pause deposit/withdraw when contract is paused", async function () {
    await this.farmInstance.pause();
    let user = "0xD5B7FE9891E239C993590B218e02B7EEb7dDe684";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);

    const depositAmount = getBigNumber(50, 18);
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

  it.skip("should correctly deposit and withdraw in quickswap dual rewards farms", async function () {
    let user = "0xD5B7FE9891E239C993590B218e02B7EEb7dDe684";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);

    const depositAmount = getBigNumber(50, 18);
    console.log("depositAmount ", depositAmount);
    await this.lpToken1Instance.connect(signer).approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.connect(signer).deposit(0, depositAmount, false);
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
    expect(await this.farmInstance.pendingFYGN(0, signer.address)).to.equal(getBigNumber(125, 16));
    expect(await this.farmInstance.canHarvest(0, signer.address)).to.equal(true);
    //Initial FYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(Number(0));
    //Initial QUICK and WMATIC Balance in ygn converter
    expect(await this.quickTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    expect(await this.wmaticTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.connect(signer).withdraw(0, depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(0, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(0, signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(signer.address)) / 10 ** 18).to.equal(
      Number(1.5)
    );
    //After reward token Balance in ygn converter
    console.log("wmatic balance : ", await this.wmaticTokenInstance.balanceOf(this.feeAddress));
    console.log("quick balance : ", await this.quickTokenInstance.balanceOf(this.feeAddress));
    expect(await this.quickTokenInstance.balanceOf(this.feeAddress)).gt(0);
    expect(await this.wmaticTokenInstance.balanceOf(this.feeAddress)).gt(0);
    for (let i = 0; i < 500; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.quickTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    advanceTime(300);
    advanceBlock();
    advanceBlock();

    await this.farmInstance.connect(signer).withdraw(0, depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(0, signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(userInfo.amount).to.equal(getBigNumber(0));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(0)).totalInputTokensStaked;
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(parseEther("127.25"));
    //After QUICK Balance in ygn converter
    expect(Number(await this.quickTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    expect(Number(await this.wmaticTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    await this.fygnTokenInstance.connect(signer).transfer(this.feeAddress, parseEther("127.25"));
  });

  it("should correctly deposit and withdraw in Cafeswap farms", async function () {
    let user = "0x4def43e20e659A06045d812B3f129d6Bca65969E";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);
    const depositAmount = parseEther("0.001");
    await this.lpToken4Instance.connect(signer).approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.connect(signer).deposit(2, depositAmount, false);
    let userInfo = await this.farmInstance.userInfo(2, signer.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(2);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farmInstance.pendingFYGN(2, signer.address)).to.equal(parseEther("1.25"));
    expect(await this.farmInstance.canHarvest(2, signer.address)).to.equal(true);
    //Initial FYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(Number(0));

    expect(await this.brewShareTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.connect(signer).withdraw(2, depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(2, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(2, signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(signer.address)) / 10 ** 18).to.equal(
      Number(1.5)
    );
    //After reward token Balance in ygn converter
    expect(Number(await this.brewShareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(
      0
    );
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.brewShareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(
      0
    );
    advanceTime(300);
    advanceBlock();
    advanceBlock();
    await this.farmInstance.connect(signer).withdraw(2, depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(2, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));

    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(parseEther("3.5"));

    expect(Number(await this.brewShareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(
      0
    );
  });

  it.skip("should correctly deposit and withdraw in sushiswap dual rewards farms", async function () {
    let user = "0xab9d9294bc1fb14c0c455156d4d12bfebe9a35fe";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);
    const depositAmount = getBigNumber(1, 16);
    await this.lpToken2Instance.connect(signer).approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.connect(signer).deposit(1, depositAmount, false);
    let userInfo = await this.farmInstance.userInfo(1, signer.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(1);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(1)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farmInstance.pendingFYGN(1, signer.address)).to.equal(parseEther("2.5"));
    expect(await this.farmInstance.canHarvest(1, signer.address)).to.equal(true);
    //Initial FYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(Number(0));
    //Initial Sushi and WMATIC Balance in ygn converter
    expect(await this.sushiTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.connect(signer).withdraw(1, depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(1, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(1);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(1)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(1, signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(signer.address)) / 10 ** 18).to.equal(Number(3));
    //After reward token Balance in ygn converter
    expect(await this.sushiTokenInstance.balanceOf(this.feeAddress)).gt(0);
    expect(await this.wmaticTokenInstance.balanceOf(this.feeAddress)).gt(0);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    advanceTime(300);
    advanceBlock();
    advanceBlock();
    console.log("Before emergency withdraw");
    await this.farmInstance.connect(signer).emergencyWithdraw(1);
    console.log("After emergency withdraw");
    userInfo = await this.farmInstance.userInfo(1, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(1);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(1)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(getBigNumber(3));
    console.log("Checkpoint 1");
    //After QUICK Balance in ygn converter
    expect(await this.sushiTokenInstance.balanceOf(this.feeAddress)).gt(0);
    expect(await this.wmaticTokenInstance.balanceOf(this.feeAddress)).gt(0);
    console.log("Checkpoint 2");
    await this.fygnTokenInstance.connect(signer).transfer(this.feeAddress, parseEther("3"));
  });

  it.skip("should correctly deposit and withdraw in nacho farms", async function () {
    let user = "0x64ac070cbd85bdcc0b6d473cb419e2cfed4cb35f";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);
    const depositAmount = getBigNumber(25);
    await this.lpToken3Instance.connect(signer).approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.connect(signer).deposit(2, depositAmount, false);
    let userInfo = await this.farmInstance.userInfo(2, signer.address);
    let lpSupply = await this.farmInstance.getLpTokenAmount(2);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount);
    expect(lpSupply).to.equal(depositAmount);
    expect(totalInputTokensStaked).to.equal(depositAmount);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farmInstance.pendingFYGN(2, signer.address)).to.equal(parseEther("1.25"));
    expect(await this.farmInstance.canHarvest(2, signer.address)).to.equal(true);
    //Initial FYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(Number(0));
    //Initial QUICK and WMATIC Balance in ygn converter
    expect(await this.nshareTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.connect(signer).withdraw(2, depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(2, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(depositAmount.div(2));
    expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(depositAmount.div(2));
    expect(await this.farmInstance.pendingFYGN(2, signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(signer.address)) / 10 ** 18).to.equal(
      Number(1.5)
    );
    //After reward token Balance in ygn converter
    expect(Number(await this.nshareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.nshareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    advanceTime(300);
    advanceBlock();
    advanceBlock();
    await this.farmInstance.connect(signer).withdraw(2, depositAmount.div(2), false);
    userInfo = await this.farmInstance.userInfo(2, signer.address);
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(getBigNumber(3));
    //After QUICK Balance in ygn converter
    expect(Number(await this.nshareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
  });

  it("should correctly deposit and withdraw in ETH-Nacho farms", async function () {

    let user = "0x77ceea82E4362dD3B2E0D7F76d0A71A628Cad300";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [user],
    });
    const signer = await ethers.getSigner(user);
    const depositAmount = getBigNumber(25);
    await this.lpToken4Instance.connect(signer).approve(this.farmWrapperInstance.address, MaxUint256);
    await this.farmWrapperInstance.connect(signer).deposit(2, depositAmount, false);
    let userInfo = await this.farmInstance.userInfo(2, signer.address);
    console.log('userinfo in farm ', userInfo.amount);
    console.log('userinfo after deposit in nacho farm ', await this.nachoFarmInstance.userInfo(0, this.nachoXYZETHStrategyInstance.address));
    let lpSupply = await this.farmInstance.getLpTokenAmount(2);
    const lpSupplyAfterDeposit = lpSupply;
    console.log('after deposit lpSupply ', lpSupply);
    let totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(lpSupply);
    expect(totalInputTokensStaked).to.equal(lpSupply);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    // expect(await this.farmInstance.pendingFYGN(2, signer.address)).to.equal(parseEther("1.25"));
    expect(await this.farmInstance.canHarvest(2, signer.address)).to.equal(true);
    //Initial FYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(Number(0));
    //Initial QUICK and WMATIC Balance in ygn converter
    expect(await this.nshareTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    console.log('start first withdraw');
    await this.farmInstance.connect(signer).withdraw(2, lpSupplyAfterDeposit.div(2), false);
    userInfo = await this.farmInstance.userInfo(2, signer.address);
    console.log('userinfo in farm ', userInfo.amount);
    console.log('userinfo after withdraw in nacho farm ', await this.nachoFarmInstance.userInfo(0, this.nachoXYZETHStrategyInstance.address));

    console.log('end first withdraw');
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    console.log('after first withdrawal lpSupply ', lpSupply);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    // expect(userInfo.amount).to.equal(lpSupply.div(2));
    // expect(lpSupply).to.equal(depositAmount.div(2));
    expect(totalInputTokensStaked).to.equal(lpSupply);
    expect(await this.farmInstance.pendingFYGN(2, signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    // expect((await this.fygnTokenInstance.balanceOf(signer.address)) / 10 ** 18).to.equal(
    //   Number(1.4)
    // );
    //After reward token Balance in ygn converter
    expect(Number(await this.nshareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(Number(await this.nshareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
    advanceTime(300);
    advanceBlock();
    advanceBlock();
    console.log('start second withdraw');
    console.log('await this.farmInstance.userInfo(2, signer.address) ', await this.farmInstance.userInfo(2, signer.address))
    await this.farmInstance.connect(signer).withdraw(2, lpSupplyAfterDeposit.div(2), false);
    userInfo = await this.farmInstance.userInfo(2, signer.address);
    console.log('userinfo in farm ', userInfo.amount);
    console.log('userinfo after withdraw in nacho farm ', await this.nachoFarmInstance.userInfo(0, this.nachoXYZETHStrategyInstance.address));

    console.log('end second withdraw');
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    totalInputTokensStaked = (await this.farmInstance.poolInfo(2)).totalInputTokensStaked;
    expect(userInfo.amount).to.equal(getBigNumber(0));
    console.log('after second lpSupply ', lpSupply);
    // TODO: verify this
    // expect(lpSupply).to.equal(getBigNumber(0));
    expect(totalInputTokensStaked).to.equal(getBigNumber(0));
    console.log('await this.fygnTokenInstance.balanceOf(signer.address) ', await this.fygnTokenInstance.balanceOf(signer.address));
    // expect(await this.fygnTokenInstance.balanceOf(signer.address)).to.equal(parseEther("3.5"));

    expect(Number(await this.nshareTokenInstance.balanceOf(this.feeAddress))).to.be.greaterThan(0);
  });


  // it("should correctly deposit and withdraw in farms with no child pools", async function () {
  //   //Clearing out balance before testing
  //   await this.fygnTokenInstance.transfer(
  //     this.feeAddress,
  //     await this.fygnTokenInstance.balanceOf(this.signer.address)
  //   );
  //   await this.lpToken4Instance.approve(this.farmInstance.address, MaxUint256);
  //   await this.farmInstance.deposit(3, getBigNumber(10));
  //   let userInfo = await this.farmInstance.userInfo(3, this.signer.address);
  //   expect(userInfo.amount).to.equal(getBigNumber(10));
  //   let lpSupply = await this.farmInstance.getLpTokenAmount(3);
  //   expect(lpSupply).to.equal(getBigNumber(10));
  //   advanceBlock();
  //   advanceBlock();
  //   advanceBlock();
  //   advanceTime(300);
  //   advanceBlock();
  //   expect(await this.farmInstance.pendingFYGN(3, this.signer.address)).to.equal(getBigNumber(1));
  //   expect(await this.farmInstance.canHarvest(3, this.signer.address)).to.equal(true);
  //   //Initial fYGN Balance
  //   expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(Number(0));
  //   await this.farmInstance.withdraw(3, getBigNumber(5));
  //   userInfo = await this.farmInstance.userInfo(3, this.signer.address);
  //   expect(userInfo.amount).to.equal(getBigNumber(5));
  //   lpSupply = await this.farmInstance.getLpTokenAmount(3);
  //   expect(lpSupply).to.equal(getBigNumber(5));
  //   expect(await this.farmInstance.pendingFYGN(3, this.signer.address)).to.equal(getBigNumber(0));
  //   //After YGN Balance
  //   expect((await this.fygnTokenInstance.balanceOf(this.signer.address)) / 10 ** 18).to.equal(
  //     Number(1.25)
  //   );
  //   advanceBlock();
  //   advanceBlock();
  //   advanceBlock();
  //   advanceTime(300);
  //   advanceBlock();
  //   await this.farmInstance.withdraw(3, 0);
  //   expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(
  //     getBigNumber(25, 17)
  //   );
  //   advanceTime(300);
  //   advanceBlock();
  //   await this.farmInstance.withdraw(3, getBigNumber(5));
  //   userInfo = await this.farmInstance.userInfo(3, this.signer.address);
  //   expect(userInfo.amount).to.equal(getBigNumber(0));
  //   lpSupply = await this.farmInstance.getLpTokenAmount(3);
  //   expect(lpSupply).to.equal(getBigNumber(0));
  //   expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(getBigNumber(3));
  // });
});
