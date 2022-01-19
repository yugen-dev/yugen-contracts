const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { advanceBlock } = require("../utilities/time");
const { getBigNumber } = require("../utilities/index");
const rewardManagerByteCode =
  require("../../artifacts/contracts/RewardManager.sol/RewardManager.json").bytecode;

const ERC20TokensSupply = getBigNumber(10 ** 6);

describe("Reward Manager Factory Contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];

    const FYGN = await ethers.getContractFactory("FYGN");
    this.fYGNTokenInstance = await FYGN.connect(this.signer).deploy("Farm YUGEN", "FYGN");
    console.log("FYGN Token Deployed at", this.fYGNTokenInstance.address);
    await this.fYGNTokenInstance.whitelistMinter(this.signer.address);
    await this.fYGNTokenInstance.mint(this.signer.address, getBigNumber(600));

    const YGN = await ethers.getContractFactory("ERC20Mock");
    this.ygnTokenInstance = await YGN.deploy("YUGEN", "YGN", ERC20TokensSupply);

    const YGNStaker = await ethers.getContractFactory("YGNStaker");
    this.ygnStakerInstance = await YGNStaker.deploy(this.ygnTokenInstance.address);

    const FYGNClaimableBurner = await ethers.getContractFactory("FYGNClaimableBurner");
    this.fYGNClaimableBurnerInstance = await FYGNClaimableBurner.deploy(
      this.fYGNTokenInstance.address,
      this.ygnTokenInstance.address,
      this.ygnStakerInstance.address
    );

    await this.ygnTokenInstance.transfer(
      this.fYGNClaimableBurnerInstance.address,
      getBigNumber(100)
    );

    const RewardManagerFactory = await ethers.getContractFactory("RewardManagerFactory");

    this.rewardManagerFactory = await RewardManagerFactory.deploy(this.fYGNTokenInstance.address);
    console.log("Reward Manager Factory Deployed at", this.rewardManagerFactory.address);

    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const startDistribution = Number(latestBlock.timestamp) + 10;
    const endDistribution = startDistribution + 100;

    await this.rewardManagerFactory.launchRewardManager(
      this.fYGNTokenInstance.address,
      this.ygnTokenInstance.address,
      this.fYGNClaimableBurnerInstance.address,
      this.ygnStakerInstance.address,
      startDistribution,
      endDistribution,
      200,
      350,
      0,
      rewardManagerByteCode
    );

    await this.fYGNTokenInstance.transfer(this.rewardManagerFactory.address, getBigNumber(400));

    await this.rewardManagerFactory.updateRewardDistributor(this.signer.address, true);

    this.firstRewardManagerAddress = (await this.rewardManagerFactory.managers(0)).managerAddress;

    console.log("1st Reward Manager Deployed at", this.firstRewardManagerAddress);

    const RewardManager = await ethers.getContractFactory("RewardManager");

    this.firstRewardManagerInstance = await RewardManager.attach(this.firstRewardManagerAddress);

    const usersXYGNBalanceBefore = await this.ygnStakerInstance.balanceOf(this.signer.address);
    console.log(`User's XYGN balance before`, String(usersXYGNBalanceBefore));
    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      true
    );
    const usersXYGNBalanceAfter = await this.ygnStakerInstance.balanceOf(this.signer.address);
    console.log(`User's XYGN balance after`, String(usersXYGNBalanceAfter));
    expect(Number(usersXYGNBalanceAfter.sub(usersXYGNBalanceBefore))).to.be.greaterThan(0);
  });

  it("should set correct state variables", async function () {
    const totalRewardManagers = await this.rewardManagerFactory.totalRewardManagers();
    const fYGN = await this.rewardManagerFactory.fYGN();
    const rewardDistributorStatus = await this.rewardManagerFactory.rewardDistributor(
      this.signer.address
    );
    const firstRewardManagerIndex = await this.rewardManagerFactory.managerIndex(
      this.firstRewardManagerAddress
    );
    const firstRewardManager = await this.rewardManagerFactory.managers(0);
    const owner = await this.rewardManagerFactory.owner();

    expect(owner).to.equal(this.signer.address);
    expect(totalRewardManagers).to.equal(1);
    expect(fYGN).to.equal(this.fYGNTokenInstance.address);
    expect(rewardDistributorStatus).to.equal(true);
    expect(firstRewardManagerIndex).to.equal(0);
    expect(firstRewardManager.managerAddress).to.equal(this.firstRewardManagerAddress);
    expect(firstRewardManager.startDistribution).to.equal(
      await this.firstRewardManagerInstance.startDistribution()
    );
    expect(firstRewardManager.endDistribution).to.equal(
      await this.firstRewardManagerInstance.endDistribution()
    );
    expect(await this.firstRewardManagerInstance.upfrontUnlock()).to.equal(200);
    expect(await this.firstRewardManagerInstance.preMaturePenalty()).to.equal(350);
    expect(await this.firstRewardManagerInstance.bonusPercentage()).to.equal(0);
    const userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(100));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));
  });

  it("should correctly fetch vesting info", async function () {
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(100));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      true
    );

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(200));

    console.log("Users rewards are added multiple times before vesting");

    await this.rewardManagerFactory.drawDown();
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));

    console.log(`Don't want to wait for rewards. Force claiming and staking.......`);

    const userFYGNBalanceBefore = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceBefore = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceBefore = await this.ygnStakerInstance.balanceOf(this.signer.address);
    await this.rewardManagerFactory.preMatureDrawAndStake();
    const userFYGNBalanceAfter = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceAfter = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceAfter = await this.ygnStakerInstance.balanceOf(this.signer.address);

    expect(userFYGNBalanceAfter.sub(userFYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(userYGNBalanceAfter.sub(userYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(Number(userXYGNBalanceAfter.sub(userXYGNBalanceBefore))).to.be.greaterThan(0);

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(70));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(0));

    console.log(`Pre Mature Draw Success <++>`);

    console.log(`Adding More Rewards to Reward Manager for further flow <++>`);

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      true
    );

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(70));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));

    for (let i = 0; i < 2; i++) {
      advanceBlock();
    }

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(70));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.bonusRewards).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(100));

    console.log("Vested Rewards Distribution Begins now");
  });

  it("should revert if handle rewards for user is called in vesting period", async function () {
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    await expect(
      this.rewardManagerFactory.handleRewardsForUser(this.signer.address, getBigNumber(25), true)
    ).to.be.revertedWith("Cannot vest in distribution phase");
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(300));
    console.log(`User's vesting amount did not change in distribution period`);
  });

  it("should draw down claimable amount from first reward manager", async function () {
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(200));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(1));

    console.log(
      `User should be able to claim claimable rewards of ${userTotalVestingInfo.claimable.toString()} fYGN `
    );

    console.log(
      `User's XYGN Balance before drawing down and staking - ${await this.ygnStakerInstance.balanceOf(
        this.signer.address
      )}`
    );
    const userFYGNBalanceBefore = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceBefore = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceBefore = await this.ygnStakerInstance.balanceOf(this.signer.address);

    await this.rewardManagerFactory.drawDownAndStake();

    console.log(
      `User's XYGN Balance after drawing down and staking - ${await this.ygnStakerInstance.balanceOf(
        this.signer.address
      )}`
    );
    const userFYGNBalanceAfter = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceAfter = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceAfter = await this.ygnStakerInstance.balanceOf(this.signer.address);

    expect(userFYGNBalanceAfter.sub(userFYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(userYGNBalanceAfter.sub(userYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(Number(userXYGNBalanceAfter.sub(userXYGNBalanceBefore))).to.be.greaterThan(0);

    for (let i = 0; i < 50; i++) {
      advanceBlock();
    }

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(50));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(98));
  });

  it("should launch new reward manager", async function () {
    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const startDistribution = Number(latestBlock.timestamp) + 10;
    const endDistribution = startDistribution + 50;

    await this.rewardManagerFactory.launchRewardManager(
      this.fYGNTokenInstance.address,
      this.ygnTokenInstance.address,
      this.fYGNClaimableBurnerInstance.address,
      this.ygnStakerInstance.address,
      startDistribution,
      endDistribution,
      200,
      350,
      0,
      rewardManagerByteCode
    );

    this.secondRewardManagerAddress = (await this.rewardManagerFactory.managers(1)).managerAddress;

    console.log("2nd Reward Manager Deployed at", this.secondRewardManagerAddress);

    await this.rewardManagerFactory.updateRewardDistributor(this.signer.address, true);

    await this.fYGNTokenInstance.transfer(this.rewardManagerFactory.address, getBigNumber(125));

    await this.rewardManagerFactory.handleRewardsForUser(
      this.signer.address,
      getBigNumber(125),
      true
    );

    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(54));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(198));

    for (let i = 0; i < 25; i++) {
      advanceBlock();
    }
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );

    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(117));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(198));
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(202));
  });

  it("should draw down claimable amount from both reward managers", async function () {
    console.log(
      `User's XYGN Balance before drawing down and staking - ${await this.ygnStakerInstance.balanceOf(
        this.signer.address
      )}`
    );
    const userFYGNBalanceBefore = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceBefore = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceBefore = await this.ygnStakerInstance.balanceOf(this.signer.address);

    await this.rewardManagerFactory.drawDownAndStake();

    console.log(
      `User's XYGN Balance after drawing down and staking - ${await this.ygnStakerInstance.balanceOf(
        this.signer.address
      )}`
    );
    const userFYGNBalanceAfter = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceAfter = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceAfter = await this.ygnStakerInstance.balanceOf(this.signer.address);

    expect(userFYGNBalanceAfter.sub(userFYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(userYGNBalanceAfter.sub(userYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(Number(userXYGNBalanceAfter.sub(userXYGNBalanceBefore))).to.be.greaterThan(0);
    let userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(322));
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(78));
  });

  it("should force withdraw the remaining tokens", async function () {
    const userFYGNBalanceBefore = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceBefore = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceBefore = await this.ygnStakerInstance.balanceOf(this.signer.address);
    await this.rewardManagerFactory.preMatureDrawAndStake();
    const userFYGNBalanceAfter = await this.fYGNTokenInstance.balanceOf(this.signer.address);
    const userYGNBalanceAfter = await this.ygnTokenInstance.balanceOf(this.signer.address);
    const userXYGNBalanceAfter = await this.ygnStakerInstance.balanceOf(this.signer.address);

    expect(userFYGNBalanceAfter.sub(userFYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(userYGNBalanceAfter.sub(userYGNBalanceBefore)).to.equal(getBigNumber(0));
    expect(Number(userXYGNBalanceAfter.sub(userXYGNBalanceBefore))).to.be.greaterThan(0);

    const userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.totalDrawnAmount).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.totalVested).to.equal(getBigNumber(400));
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.stillDue).to.equal(getBigNumber(0));
    expect(userTotalVestingInfo.amountBurnt).to.equal(getBigNumber(9625, 16));
  });

  it("should not draw in vesting period after force claimed", async function () {
    console.log(
      `User's Balance before draw down`,
      String(await this.fYGNTokenInstance.balanceOf(this.signer.address))
    );
    await this.rewardManagerFactory.drawDown();
    userTotalVestingInfo = await this.rewardManagerFactory.userTotalVestingInfo(
      this.signer.address
    );
    expect(userTotalVestingInfo.claimable).to.equal(getBigNumber(0));
    console.log(
      `User's Balance after draw down`,
      String(await this.fYGNTokenInstance.balanceOf(this.signer.address))
    );
  });
});
