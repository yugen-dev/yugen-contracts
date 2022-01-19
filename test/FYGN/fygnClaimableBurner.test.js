const { ethers } = require("hardhat");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
chai.use(chaiAsPromised);
const { assert } = require("chai");
const { parseEther } = require("@ethersproject/units");

describe("FYGNClaimableBurner Contract", function () {
  let fygnInstance, minter, deployer, allAccounts, user, ygnTokenInstance;
  const amount = parseEther("10"); // 10 tokens
  const ERC20TokensSupply = parseEther("1000");
  let fYGNClaimableBurnerInstance, ygnStakerInstance;
  let claimableBurnerYGNBalance = parseEther("100");

  beforeEach(async function () {

    allAccounts = await ethers.getSigners();
    minter = allAccounts[2];
    deployer = allAccounts[0];
    user = allAccounts[5];
    const FYGN = await ethers.getContractFactory("FYGN");
    const YGN = await ethers.getContractFactory("ERC20Mock");
    ygnTokenInstance = await YGN.connect(deployer).deploy("YUGEN", "YGN", ERC20TokensSupply);
    fygnInstance = await FYGN.connect(deployer).deploy("Farm YUGEN", "FYGN");

    await fygnInstance.connect(deployer).whitelistMinter(minter.address);

    // user is minted with 10 fygn tokens
    await fygnInstance.connect(minter).mint(user.address, amount);

    const YGNStaker = await ethers.getContractFactory('YGNStaker');
    ygnStakerInstance = await YGNStaker.deploy(ygnTokenInstance.address);

    const FYGNClaimableBurner = await ethers.getContractFactory('FYGNClaimableBurner');
    fYGNClaimableBurnerInstance = await FYGNClaimableBurner.deploy(
      fygnInstance.address,
      ygnTokenInstance.address,
      ygnStakerInstance.address
    );

    await ygnTokenInstance
      .connect(deployer)
      .transfer(fYGNClaimableBurnerInstance.address, claimableBurnerYGNBalance);
  });

  it("should get YGN tokens", async function () {
    const sharesWithdrawn = parseEther("5");

    const expectedFromContract = await fYGNClaimableBurnerInstance.getYGNAmount(sharesWithdrawn);
    const fYGNTotalSupplyBeforeLeave = await fygnInstance.totalSupply();

    const beforeYGNBalance = await ygnTokenInstance.balanceOf(user.address);
    await fygnInstance.connect(user).approve(fYGNClaimableBurnerInstance.address, sharesWithdrawn);
    await fYGNClaimableBurnerInstance.connect(user).leave(sharesWithdrawn);

    const afterYGNBalance = await ygnTokenInstance.balanceOf(user.address);

    // total_supply_of_fygn = 10
    // ygn_locked_in_claimable_burner = 100
    // user burns 5 fygn
    // expected fygn to user = (5 * ygn_locked_in_claimable_burner)/total_supply_of_fygn
    //                       = (5 * 100)/10
    //                       = 50 ygn tokens
    const expectedUserBalance = parseEther("50");

    assert.equal(
      expectedUserBalance.eq(afterYGNBalance.sub(beforeYGNBalance)),
      true,
      `Expected user balance is ${expectedUserBalance} but got` +
        `${afterYGNBalance.sub(beforeYGNBalance)}`
    );

    // Amount received from `getYGNAmount` method in the contract
    assert.equal(
      expectedUserBalance.eq(expectedFromContract),
      true,
      `Expected user balance is ${expectedUserBalance} but got ${expectedFromContract}`
    );

    // As 5 FYGN tokens is burnt, total supply will be reduced.
    const fYGNTotalSupplyAfterLeave = await fygnInstance.totalSupply();

    assert.equal(
      fYGNTotalSupplyBeforeLeave.sub(fYGNTotalSupplyAfterLeave).eq(sharesWithdrawn),
      true,
      `Expected shares to be burnt is ${sharesWithdrawn} but got` +
        `${fYGNTotalSupplyBeforeLeave.sub(fYGNTotalSupplyAfterLeave)}`
    );
  });

  it("should burn FYGN for another account", async function () {
    // here another account would receive YGN tokens
    const anotherAccount = allAccounts[4];

    const sharesWithdrawn = parseEther("5");

    const beforeYGNBalance = await ygnTokenInstance.balanceOf(user.address);
    await fygnInstance.connect(user).approve(fYGNClaimableBurnerInstance.address, sharesWithdrawn);
    await fYGNClaimableBurnerInstance.connect(user).burnFYGNFor(
      anotherAccount.address,
      sharesWithdrawn
    );

    const afterYGNBalance = await ygnTokenInstance.balanceOf(user.address);

    // Caller user's YGN balance must not change.
    assert.equal(
      beforeYGNBalance.eq(afterYGNBalance),
      true,
      `Expected balance for caller should not change`,
    );

    // total_supply_of_fygn = 10
    // ygn_locked_in_claimable_burner = 100
    // user burns 5 fygn
    // expected fygn to user = (5 * ygn_locked_in_claimable_burner)/total_supply_of_fygn
    //                       = (5 * 100)/10
    //                       = 50 ygn tokens
    const expectedAnotherAccountBalance = parseEther("50");
    const anotherAccountBalance = await ygnTokenInstance.balanceOf(anotherAccount.address);

    assert.equal(
      expectedAnotherAccountBalance.eq(anotherAccountBalance),
      true,
      `Expected user balance is ${expectedAnotherAccountBalance} but got ${anotherAccountBalance}`
    );

  });

  it("should burn and stake directly to YGNStaker", async function () {

    const sharesToBeBurnt = parseEther("5");

    const expectedFromContract = await fYGNClaimableBurnerInstance.getYGNAmount(sharesToBeBurnt);
    // const fYGNTotalSupplyBeforeLeave = await fygnInstance.totalSupply();

    const beforeYGNBalance = await ygnTokenInstance.balanceOf(user.address);
    await fygnInstance.connect(user).approve(fYGNClaimableBurnerInstance.address, sharesToBeBurnt);
    await fYGNClaimableBurnerInstance.connect(user).burnAndStake(
      sharesToBeBurnt
    );

    const afterYGNBalance = await ygnTokenInstance.balanceOf(user.address);

    // Caller user's YGN balance must not change.
    assert.equal(
      beforeYGNBalance.eq(afterYGNBalance),
      true,
      `Expected balance for caller should not change`,
    );

    // total_supply_of_fygn = 10
    // ygn_locked_in_claimable_burner = 100
    // user burns 5 fygn
    // expected fygn to user = (5 * ygn_locked_in_claimable_burner)/total_supply_of_fygn
    //                       = (5 * 100)/10
    //                       = 50 ygn tokens
    const expectedYGNStakerBalance = parseEther("50");
    const ygnStakerYGNBalance = await ygnTokenInstance.balanceOf(ygnStakerInstance.address);

    assert.equal(
      expectedYGNStakerBalance.eq(ygnStakerYGNBalance),
      true,
      `Expected user balance is ${expectedYGNStakerBalance} but got ${ygnStakerYGNBalance}`
    );

    const expectedXYGNUserBalance = parseEther("50");
    const userXYGNBalance = await ygnStakerInstance.balanceOf(user.address);
    assert.equal(
      expectedXYGNUserBalance.eq(userXYGNBalance),
      true,
      `Expected user balance is ${expectedXYGNUserBalance} but got ${userXYGNBalance}`,
    );

  });

});
