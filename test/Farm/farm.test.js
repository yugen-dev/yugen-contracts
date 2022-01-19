const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const { getBigNumber } = require("../utilities/index");
const { advanceBlock, advanceTime } = require("../utilities/time");
const ERC20TokensSupply = getBigNumber(10 ** 6);
const START_BLOCK = 0;
const BONUS_END_BLOCK = 0;
const FYGN_PER_BLOCK = "1000000000000000000";
const PQR_PER_BLOCK = "1000000000000000000";

describe("Yugen Farm Contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.adminAddress = this.signer.address;
    this.feeCollector = this.signers[1];
    this.feeAddress = this.feeCollector.address;

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

    const cntToken = await ethers.getContractFactory("ERC20Mock");
    this.cntTokenInstance = await cntToken.deploy("CNT", "CNT", ERC20TokensSupply);
    console.log("cntToken deployed at " + this.cntTokenInstance.address);

    const ChildFarmWithNoFee = await ethers.getContractFactory("MasterChef");
    this.childFarmWithNoFeeInstance = await ChildFarmWithNoFee.deploy(
      this.cntTokenInstance.address,
      this.feeAddress,
      this.feeAddress,
      START_BLOCK //simulate start of some old start block
    );
    console.log("ChildFarmWithNoFee deployed at " + this.childFarmWithNoFeeInstance.address);

    const lmnToken = await ethers.getContractFactory("ERC20Mock");
    this.lmnTokenInstance = await lmnToken.deploy("LMN", "LMN", ERC20TokensSupply);
    console.log("lmnToken deployed at " + this.lmnTokenInstance.address);

    const ChildFarmWithNoFeeV2 = await ethers.getContractFactory("MasterChef");
    this.childFarmWithNoFeeInstanceV2 = await ChildFarmWithNoFeeV2.deploy(
      this.lmnTokenInstance.address,
      this.feeAddress,
      this.feeAddress,
      START_BLOCK
    );
    console.log("ChildFarmWithNoFee deployed at " + this.childFarmWithNoFeeInstanceV2.address);

    const abcToken = await ethers.getContractFactory("ERC20Mock");
    this.abcTokenInstance = await abcToken.deploy("ABC", "ABC", ERC20TokensSupply);
    console.log("abcToken deployed at " + this.abcTokenInstance.address);

    const ChildFarmWithDepositFee = await ethers.getContractFactory("MasterChef");
    this.childFarmWithDepositFeeInstance = await ChildFarmWithDepositFee.deploy(
      this.abcTokenInstance.address,
      this.feeAddress,
      this.feeAddress,
      START_BLOCK
    );
    console.log(
      "ChildFarmWithDepositFee deployed at " + this.childFarmWithDepositFeeInstance.address
    );

    const xyzToken = await ethers.getContractFactory("ERC20Mock");
    this.xyzTokenInstance = await xyzToken.deploy("XYZ", "XYZ", ERC20TokensSupply);
    console.log("xyzToken deployed at " + this.xyzTokenInstance.address);

    const ChildFarmWithReferral = await ethers.getContractFactory("MasterChef");
    this.childFarmWithReferralInstance = await ChildFarmWithReferral.deploy(
      this.xyzTokenInstance.address,
      this.feeAddress,
      this.feeAddress,
      START_BLOCK
    );
    console.log("ChildFarmWithReferral deployed at " + this.childFarmWithReferralInstance.address);

    const pqrToken = await ethers.getContractFactory("ERC20Mock");
    this.pqrTokenInstance = await pqrToken.deploy("PQR", "PQR", ERC20TokensSupply);
    console.log("pqrToken deployed at " + this.pqrTokenInstance.address);

    const ChildFarmWithWithdrawalFee = await ethers.getContractFactory("WithdrawFeeFarm");
    this.childFarmWithWithdrawalFeeInstance = await ChildFarmWithWithdrawalFee.deploy(
      this.pqrTokenInstance.address,
      PQR_PER_BLOCK,
      this.feeAddress,
      START_BLOCK,
      BONUS_END_BLOCK
    );
    console.log(
      "ChildFarmWithWithdrawalFee deployed at " + this.childFarmWithWithdrawalFeeInstance.address
    );

    //sending reward tokens to respective farms
    await this.cntTokenInstance.transfer(
      this.childFarmWithNoFeeInstance.address,
      getBigNumber(10 ** 6)
    );
    await this.lmnTokenInstance.transfer(
      this.childFarmWithNoFeeInstanceV2.address,
      getBigNumber(10 ** 6)
    );
    await this.abcTokenInstance.transfer(
      this.childFarmWithDepositFeeInstance.address,
      getBigNumber(10 ** 6)
    );
    await this.xyzTokenInstance.transfer(
      this.childFarmWithReferralInstance.address,
      getBigNumber(10 ** 6)
    );
    await this.pqrTokenInstance.transfer(
      this.childFarmWithReferralInstance.address,
      getBigNumber(10 ** 6)
    );

    const lpToken1 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken1Instance = await lpToken1.deploy("LP Token A", "LPA", ERC20TokensSupply);
    const lpToken2 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken2Instance = await lpToken2.deploy("LP Token B", "LPB", ERC20TokensSupply);
    const lpToken3 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken3Instance = await lpToken3.deploy("LP Token C", "LPC", ERC20TokensSupply);
    //for yugen farm with no child
    const lpToken4 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken4Instance = await lpToken4.deploy("LP Token D", "LPD", ERC20TokensSupply);
    //for withdrawal fee farm
    const lpToken5 = await ethers.getContractFactory("ERC20Mock");
    this.lpToken5Instance = await lpToken5.deploy("LP Token E", "LPE", ERC20TokensSupply);

    //adding pools in child farms with LPs
    await this.childFarmWithNoFeeInstance.add(100, this.lpToken1Instance.address, 0, 300, true);
    await this.childFarmWithDepositFeeInstance.add(
      100,
      this.lpToken2Instance.address,
      1000,
      300,
      true
    );
    await this.childFarmWithReferralInstance.add(100, this.lpToken3Instance.address, 0, 300, true);
    await this.childFarmWithNoFeeInstanceV2.add(100, this.lpToken1Instance.address, 0, 300, true);
    await this.childFarmWithWithdrawalFeeInstance.add(
      100,
      this.lpToken5Instance.address,
      500,
      300,
      true
    );

    //adding child farms to yugen
    await this.farmInstance.add(
      100,
      this.lpToken1Instance.address,
      0,
      300,
      this.childFarmWithNoFeeInstance.address,
      0,
      this.cntTokenInstance.address,
      false,
      true
    );
    await this.farmInstance.add(
      100,
      this.lpToken2Instance.address,
      0,
      300,
      this.childFarmWithDepositFeeInstance.address,
      0,
      this.abcTokenInstance.address,
      false,
      true
    );
    await this.farmInstance.add(
      100,
      this.lpToken3Instance.address,
      0,
      300,
      this.childFarmWithReferralInstance.address,
      0,
      this.xyzTokenInstance.address,
      true,
      true
    );
    await this.farmInstance.add(
      100,
      this.lpToken4Instance.address,
      0,
      300,
      AddressZero,
      0,
      AddressZero,
      false,
      true
    );
    await this.farmInstance.add(
      100,
      this.lpToken5Instance.address,
      500,
      300,
      this.childFarmWithWithdrawalFeeInstance.address,
      0,
      this.pqrTokenInstance.address,
      false,
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
    const poolInfo3 = await this.farmInstance.poolInfo(3);
    const poolInfo4 = await this.farmInstance.poolInfo(4);

    expect(fygn).to.equal(this.fygnTokenInstance.address);
    expect(fYGNPerBlock).to.equal(String(FYGN_PER_BLOCK));
    expect(ygnConverter).to.equal(this.feeAddress);
    expect(isRewardManagerEnabled).to.equal(false);
    expect(rewardManager).to.equal(AddressZero);
    expect(owner).to.equal(this.adminAddress);
    expect(totalAllocPoint).to.equal(Number(500));
    expect(await this.farmInstance.poolLength()).to.equal(Number(5));

    expect(poolInfo0.lpToken).to.equal(this.lpToken1Instance.address);
    expect(poolInfo1.lpToken).to.equal(this.lpToken2Instance.address);
    expect(poolInfo2.lpToken).to.equal(this.lpToken3Instance.address);
    expect(poolInfo3.lpToken).to.equal(this.lpToken4Instance.address);
    expect(poolInfo4.lpToken).to.equal(this.lpToken5Instance.address);

    expect(await this.farmInstance.activeLpTokens(this.lpToken1Instance.address)).to.equal(true);
    expect(await this.farmInstance.activeLpTokens(this.lpToken2Instance.address)).to.equal(true);
    expect(await this.farmInstance.activeLpTokens(this.lpToken3Instance.address)).to.equal(true);
    expect(await this.farmInstance.activeLpTokens(this.lpToken4Instance.address)).to.equal(true);
    expect(await this.farmInstance.activeLpTokens(this.lpToken5Instance.address)).to.equal(true);

    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo1.allocPoint).to.equal(String(100));
    expect(poolInfo2.allocPoint).to.equal(String(100));
    expect(poolInfo3.allocPoint).to.equal(String(100));
    expect(poolInfo4.allocPoint).to.equal(String(100));

    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo1.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo2.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo3.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo4.withdrawalFeeBP).to.equal(Number(500));

    expect(poolInfo0.harvestInterval).to.equal(Number(300));
    expect(poolInfo1.harvestInterval).to.equal(Number(300));
    expect(poolInfo2.harvestInterval).to.equal(Number(300));
    expect(poolInfo3.harvestInterval).to.equal(Number(300));
    expect(poolInfo4.harvestInterval).to.equal(Number(300));

    expect(poolInfo0.childFarm).to.equal(this.childFarmWithNoFeeInstance.address);
    expect(poolInfo1.childFarm).to.equal(this.childFarmWithDepositFeeInstance.address);
    expect(poolInfo2.childFarm).to.equal(this.childFarmWithReferralInstance.address);
    expect(poolInfo3.childFarm).to.equal(AddressZero);
    expect(poolInfo4.childFarm).to.equal(this.childFarmWithWithdrawalFeeInstance.address);

    expect(poolInfo0.childPoolId).to.equal(Number(0));
    expect(poolInfo1.childPoolId).to.equal(Number(0));
    expect(poolInfo2.childPoolId).to.equal(Number(0));
    expect(poolInfo3.childPoolId).to.equal(Number(0));
    expect(poolInfo4.childPoolId).to.equal(Number(0));

    expect(poolInfo0.childFarmToken).to.equal(this.cntTokenInstance.address);
    expect(poolInfo1.childFarmToken).to.equal(this.abcTokenInstance.address);
    expect(poolInfo2.childFarmToken).to.equal(this.xyzTokenInstance.address);
    expect(poolInfo3.childFarmToken).to.equal(AddressZero);
    expect(poolInfo4.childFarmToken).to.equal(this.pqrTokenInstance.address);

    expect(poolInfo0.childPoolSupportsReferral).to.equal(false);
    expect(poolInfo1.childPoolSupportsReferral).to.equal(false);
    expect(poolInfo2.childPoolSupportsReferral).to.equal(true);
    expect(poolInfo3.childPoolSupportsReferral).to.equal(false);
    expect(poolInfo4.childPoolSupportsReferral).to.equal(false);
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
    expect(totalAllocPoint).to.equal(Number(500));
  });

  it("should correctly update child pool referral support", async function () {
    await this.farmInstance.updateChildPoolReferralSupport(0, true, true);
    let poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.childPoolSupportsReferral).to.equal(true);
    await this.farmInstance.updateChildPoolReferralSupport(0, false, true);
    poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.childPoolSupportsReferral).to.equal(false);
  });

  it("should correctly deposit and withdraw in farms with no deposit fee", async function () {
    await this.lpToken1Instance.approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.deposit(0, getBigNumber(10));
    let userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    let contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(10));
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farmInstance.pendingFYGN(0, this.signer.address)).to.equal(getBigNumber(1));
    expect(await this.farmInstance.canHarvest(0, this.signer.address)).to.equal(true);
    //Initial FYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(Number(0));
    //Initial CNT Balance in ygn converter
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.withdraw(0, getBigNumber(5));
    userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(5));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(5));
    contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(0, this.farmInstance.address);
    expect(contractUserInfo.amount).to.equal(getBigNumber(5));
    expect(await this.farmInstance.pendingFYGN(0, this.signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(this.signer.address)) / 10 ** 18).to.equal(
      Number(1.2)
    );
    //After CNT Balance in ygn converter
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(6));
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    await this.farmInstance.drain(0);
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(12));
    advanceTime(300);
    advanceBlock();
    advanceBlock();
    await this.farmInstance.withdraw(0, getBigNumber(5));
    userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(0));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(0));
    contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(0, this.farmInstance.address);
    expect(contractUserInfo.amount).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(getBigNumber(3));
    //After CNT Balance in ygn converter
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(15));
  });

  it("should correctly remove child pool from yugen farm pool", async function () {
    await this.farmInstance.deposit(0, getBigNumber(10));
    userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    let contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(10));
    advanceTime(300);
    advanceBlock();
    expect((await this.farmInstance.pendingFYGN(0, this.signer.address)) / 10 ** 18).to.equal(
      Number(0.2)
    );
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(15));
    await this.farmInstance.removeChildFarmFromPool(0, true);
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(17));
    expect((await this.farmInstance.pendingFYGN(0, this.signer.address)) / 10 ** 18).to.equal(
      Number(0.4)
    );
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(17));
    userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(0, this.farmInstance.address);
    expect(contractUserInfo.amount).to.equal(getBigNumber(0));
    expect(await this.lpToken1Instance.balanceOf(this.farmInstance.address)).to.equal(
      getBigNumber(10)
    );
    const poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo0.harvestInterval).to.equal(Number(300));
    expect(poolInfo0.childFarm).to.equal(AddressZero);
    expect(poolInfo0.childPoolId).to.equal(Number(0));
    expect(poolInfo0.childFarmToken).to.equal(AddressZero);
    expect(poolInfo0.childPoolSupportsReferral).to.equal(false);
    advanceBlock();
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.drain(0);
    expect(await this.farmInstance.pendingFYGN(0, this.signer.address)).to.equal(getBigNumber(1));
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(17));
  });

  it("should revert if remove child pool is called for pool with no child farm", async function () {
    await expect(this.farmInstance.removeChildFarmFromPool(0, true)).to.be.revertedWith(
      "Child Farm address cannot be zero address"
    );
  });

  it("should revert if add child pool is called for pool with invalid addresses", async function () {
    await expect(
      this.farmInstance.addChildFarmToPool(
        0,
        AddressZero,
        0,
        this.cntTokenInstance.address,
        false,
        true
      )
    ).to.be.revertedWith("No zero address");
  });

  it("should correctly add new child pool", async function () {
    let userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    let contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(0));
    expect(await this.lpToken1Instance.balanceOf(this.farmInstance.address)).to.equal(
      getBigNumber(10)
    );
    await this.farmInstance.addChildFarmToPool(
      0,
      this.childFarmWithNoFeeInstance.address,
      0,
      this.cntTokenInstance.address,
      false,
      true
    );
    userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(0, this.farmInstance.address);
    expect(contractUserInfo.amount).to.equal(getBigNumber(10));
    expect(await this.lpToken1Instance.balanceOf(this.farmInstance.address)).to.equal(
      getBigNumber(0)
    );
    expect(await this.farmInstance.pendingFYGN(0, this.signer.address)).to.equal(
      getBigNumber(16, 17)
    );
    advanceTime(300);
    await this.farmInstance.drain(0);
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(18));
  });

  it("should revert if add child pool is called for pool with already a child farm", async function () {
    await expect(
      this.farmInstance.addChildFarmToPool(
        0,
        this.childFarmWithNoFeeInstance.address,
        0,
        this.cntTokenInstance.address,
        false,
        true
      )
    ).to.be.revertedWith("Child Farm already added to pool");
  });

  it("should revert if update child pool is called with incorrect details", async function () {
    await expect(
      this.farmInstance.updateChildFarmInPool(
        0,
        AddressZero,
        0,
        this.lmnTokenInstance.address,
        false,
        true
      )
    ).to.be.revertedWith("No zero address");
  });

  it("should correctly update new child pool", async function () {
    let userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    let contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(10));
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.updateChildFarmInPool(
      0,
      this.childFarmWithNoFeeInstanceV2.address,
      0,
      this.lmnTokenInstance.address,
      false,
      true
    );
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(22));
    expect(await this.farmInstance.pendingFYGN(0, this.signer.address)).to.equal(
      getBigNumber(26, 17)
    );
    userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    contractUserInfo = await this.childFarmWithNoFeeInstance.userInfo(0, this.farmInstance.address);
    expect(contractUserInfo.amount).to.equal(getBigNumber(0));
    expect(await this.lpToken1Instance.balanceOf(this.farmInstance.address)).to.equal(
      getBigNumber(0)
    );
    const contractUserInfoV2 = await this.childFarmWithNoFeeInstanceV2.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfoV2.amount).to.equal(getBigNumber(10));
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(22));
    const poolInfo0 = await this.farmInstance.poolInfo(0);
    expect(poolInfo0.allocPoint).to.equal(String(100));
    expect(poolInfo0.withdrawalFeeBP).to.equal(Number(0));
    expect(poolInfo0.harvestInterval).to.equal(Number(300));
    expect(poolInfo0.childFarm).to.equal(this.childFarmWithNoFeeInstanceV2.address);
    expect(poolInfo0.childPoolId).to.equal(Number(0));
    expect(poolInfo0.childFarmToken).to.equal(this.lmnTokenInstance.address);
    expect(poolInfo0.childPoolSupportsReferral).to.equal(false);
  });

  it("should be able to emergency withdraw the LP tokens", async function () {
    expect(await this.lpToken1Instance.balanceOf(this.signer.address)).to.equal(
      getBigNumber(999990)
    );
    let userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    let lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(10));
    let contractUserInfo = await this.childFarmWithNoFeeInstanceV2.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(10));
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.emergencyWithdraw(0);
    userInfo = await this.farmInstance.userInfo(0, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(0));
    lpSupply = await this.farmInstance.getLpTokenAmount(0);
    expect(lpSupply).to.equal(getBigNumber(0));
    contractUserInfo = await this.childFarmWithNoFeeInstanceV2.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(0));
    expect(await this.lpToken1Instance.balanceOf(this.farmInstance.address)).to.equal(
      getBigNumber(0)
    );
    expect(await this.lpToken1Instance.balanceOf(this.signer.address)).to.equal(
      getBigNumber(10 ** 6)
    );
    expect(await this.cntTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(22));
    expect(await this.lmnTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(2));
  });

  it("should correctly deposit and withdraw in farms with deposit fee", async function () {
    await this.fygnTokenInstance.transfer(
      this.feeAddress,
      await this.fygnTokenInstance.balanceOf(this.signer.address)
    );
    await this.lpToken2Instance.approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.deposit(1, getBigNumber(10));
    let userInfo = await this.farmInstance.userInfo(1, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(95, 17));
    let lpSupply = await this.farmInstance.getLpTokenAmount(1);
    expect(lpSupply).to.equal(getBigNumber(95, 17));
    let contractUserInfo = await this.childFarmWithDepositFeeInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(95, 17));
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    expect(await this.farmInstance.pendingFYGN(1, this.signer.address)).to.equal(
      getBigNumber(999999999993, 6)
    );
    expect(await this.farmInstance.canHarvest(1, this.signer.address)).to.equal(true);
    //Initial fYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(getBigNumber(0));
    // Initial ABC Balance in ygn converter
    expect(await this.abcTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.withdraw(1, getBigNumber(5));
    userInfo = await this.farmInstance.userInfo(1, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(45, 17));
    lpSupply = await this.farmInstance.getLpTokenAmount(1);
    expect(lpSupply).to.equal(getBigNumber(45, 17));
    contractUserInfo = await this.childFarmWithDepositFeeInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(45, 17));
    expect(await this.farmInstance.pendingFYGN(1, this.signer.address)).to.equal(getBigNumber(0));
    for (let i = 0; i < 5; i++) {
      advanceTime(60);
      advanceBlock();
    }
    await this.farmInstance.drain(1);
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.withdraw(1, getBigNumber(45, 17));
    userInfo = await this.farmInstance.userInfo(1, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(0));
    lpSupply = await this.farmInstance.getLpTokenAmount(1);
    expect(lpSupply).to.equal(getBigNumber(0));
    contractUserInfo = await this.childFarmWithDepositFeeInstance.userInfo(
      0,
      this.farmInstance.address
    );
    //values for fygn and abc are checked and are correct
    expect(contractUserInfo.amount).to.equal(getBigNumber(0));
  });

  it("should correctly deposit and withdraw in farms with referral fee", async function () {
    //Clearing out balance before testing
    await this.fygnTokenInstance.transfer(
      this.feeAddress,
      await this.fygnTokenInstance.balanceOf(this.signer.address)
    );
    await this.lpToken3Instance.approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.deposit(2, getBigNumber(10));
    let userInfo = await this.farmInstance.userInfo(2, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    let lpSupply = await this.farmInstance.getLpTokenAmount(2);
    expect(lpSupply).to.equal(getBigNumber(10));
    let contractUserInfo = await this.childFarmWithReferralInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(10));
    advanceBlock();
    advanceBlock();
    advanceBlock();
    advanceTime(300);
    advanceBlock();
    expect(await this.farmInstance.pendingFYGN(2, this.signer.address)).to.equal(getBigNumber(1));
    expect(await this.farmInstance.canHarvest(2, this.signer.address)).to.equal(true);
    //Initial YGN Balance
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(Number(0));
    //Initial CNT Balance in ygn converter
    expect(await this.xyzTokenInstance.balanceOf(this.feeAddress)).to.equal(Number(0));
    await this.farmInstance.withdraw(2, getBigNumber(5));
    userInfo = await this.farmInstance.userInfo(2, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(5));
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    expect(lpSupply).to.equal(getBigNumber(5));
    contractUserInfo = await this.childFarmWithReferralInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(5));
    expect(await this.farmInstance.pendingFYGN(2, this.signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(this.signer.address)) / 10 ** 18).to.equal(
      Number(1.25)
    );
    //After XYZ Balance in ygn converter
    expect(await this.xyzTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(51, 17));
    advanceBlock();
    advanceBlock();
    advanceBlock();
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.drain(2);
    expect(await this.xyzTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(102, 17));
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.withdraw(2, getBigNumber(5));
    userInfo = await this.farmInstance.userInfo(2, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(0));
    lpSupply = await this.farmInstance.getLpTokenAmount(2);
    expect(lpSupply).to.equal(getBigNumber(0));
    contractUserInfo = await this.childFarmWithReferralInstance.userInfo(
      0,
      this.farmInstance.address
    );
    expect(contractUserInfo.amount).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(getBigNumber(3));
    //After CNT Balance in ygn converter
    expect(await this.xyzTokenInstance.balanceOf(this.feeAddress)).to.equal(getBigNumber(1224, 16));
  });

  it("should correctly deposit and withdraw in farms with no child pools", async function () {
    //Clearing out balance before testing
    await this.fygnTokenInstance.transfer(
      this.feeAddress,
      await this.fygnTokenInstance.balanceOf(this.signer.address)
    );
    await this.lpToken4Instance.approve(this.farmInstance.address, MaxUint256);
    await this.farmInstance.deposit(3, getBigNumber(10));
    let userInfo = await this.farmInstance.userInfo(3, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(10));
    let lpSupply = await this.farmInstance.getLpTokenAmount(3);
    expect(lpSupply).to.equal(getBigNumber(10));
    advanceBlock();
    advanceBlock();
    advanceBlock();
    advanceTime(300);
    advanceBlock();
    expect(await this.farmInstance.pendingFYGN(3, this.signer.address)).to.equal(getBigNumber(1));
    expect(await this.farmInstance.canHarvest(3, this.signer.address)).to.equal(true);
    //Initial fYGN Balance
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(Number(0));
    await this.farmInstance.withdraw(3, getBigNumber(5));
    userInfo = await this.farmInstance.userInfo(3, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(5));
    lpSupply = await this.farmInstance.getLpTokenAmount(3);
    expect(lpSupply).to.equal(getBigNumber(5));
    expect(await this.farmInstance.pendingFYGN(3, this.signer.address)).to.equal(getBigNumber(0));
    //After YGN Balance
    expect((await this.fygnTokenInstance.balanceOf(this.signer.address)) / 10 ** 18).to.equal(
      Number(1.25)
    );
    advanceBlock();
    advanceBlock();
    advanceBlock();
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.withdraw(3, 0);
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(
      getBigNumber(25, 17)
    );
    advanceTime(300);
    advanceBlock();
    await this.farmInstance.withdraw(3, getBigNumber(5));
    userInfo = await this.farmInstance.userInfo(3, this.signer.address);
    expect(userInfo.amount).to.equal(getBigNumber(0));
    lpSupply = await this.farmInstance.getLpTokenAmount(3);
    expect(lpSupply).to.equal(getBigNumber(0));
    expect(await this.fygnTokenInstance.balanceOf(this.signer.address)).to.equal(getBigNumber(3));
  });
});
