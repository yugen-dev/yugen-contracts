const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const ConstructorParams = require("../../scripts/constructorParams.json");
const { getBigNumber } = require("../utilities/index");

const ERC20TokensSupply = getBigNumber(10 ** 6);
const YGN_TOKEN_EXCHANGE_ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
const CHILD_TOKEN_EXCHANGE_ROUTER = "0xBd13225f0a45BEad8510267B4D6a7c78146Be459";

describe("Converter contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.adminAddress = this.signer.address;
    this.signer1 = this.signers[1];
    this.platformAddr = this.signer1.address;

    //Deploying YGN
    const YGNToken = await ethers.getContractFactory("ERC20Mock");
    this.ygnTokenInstance = await YGNToken.deploy("Yugen Token", "YGN", ERC20TokensSupply);
    await this.ygnTokenInstance.deployed();
    console.log("ygnTokenInstance deployed at " + this.ygnTokenInstance.address);

    const Converter = await ethers.getContractFactory("UniversalConverter");
    this.converterInstance = await Converter.deploy(
      this.ygnTokenInstance.address,
      ConstructorParams.FYGN_BURNER,
      ConstructorParams.BURNER_ALLOCATION,
      ConstructorParams.YGN_STAKER,
      ConstructorParams.STAKERS_ALLOCATION,
      this.platformAddr,
      ConstructorParams.PLATFORM_FEES_ALLOCATION,
      ConstructorParams.TREASURY,
      ConstructorParams.TREASURY_ALLOCATION
    );
    await this.converterInstance.deployed();
    console.log("converterInstance deployed at " + this.converterInstance.address);

    const WMATICToken = await ethers.getContractFactory("ERC20Mock");
    this.wmaticTokenInstance = await WMATICToken.deploy(
      "Wrapped Matic",
      "WMATIC",
      ERC20TokensSupply
    );
    await this.wmaticTokenInstance.deployed();
    console.log("wmaticTokenInstance deployed at " + this.wmaticTokenInstance.address);

    const RewardToken = await ethers.getContractFactory("ERC20Mock");
    this.rewardToken1Instance = await RewardToken.deploy(
      "Reward Token 1",
      "RewardToken1",
      ERC20TokensSupply
    );
    await this.rewardToken1Instance.deployed();
    console.log("rewardToken1Instance deployed at " + this.rewardToken1Instance.address);

    this.rewardToken2Instance = await RewardToken.deploy(
      "Reward Token 2",
      "RewardToken2",
      ERC20TokensSupply
    );
    await this.rewardToken2Instance.deployed();
    console.log("rewardToken2Instance deployed at " + this.rewardToken2Instance.address);

    const yugenFarmRewardToken = await ethers.getContractFactory("ERC20Mock");
    this.yugenFarmRewardTokenInstance = await yugenFarmRewardToken.deploy(
      "Reward Token",
      "ABC",
      ERC20TokensSupply
    );
    await this.yugenFarmRewardTokenInstance.deployed();
    console.log(
      "yugenFarmRewardTokenInstance deployed at " + this.yugenFarmRewardTokenInstance.address
    );

    const UniswapV2Router1 = await ethers.getContractFactory("UniswapV2Router");
    this.uniswapV2Router1Instance = UniswapV2Router1.attach(CHILD_TOKEN_EXCHANGE_ROUTER);

    const UniswapV2Router2 = await ethers.getContractFactory("UniswapV2Router");
    this.uniswapV2Router2Instance = UniswapV2Router2.attach(YGN_TOKEN_EXCHANGE_ROUTER);
    const factoryAddress = await this.uniswapV2Router2Instance.factory();

    this.uniswapV2Factory2Instance = await ethers.getContractAt(
      "interfaces/IUniswapV2Factory.sol:IUniswapV2Factory",
      factoryAddress
    );
    console.log("Factory Address", this.uniswapV2Factory2Instance.address);

    await this.yugenFarmRewardTokenInstance.approve(
      this.uniswapV2Router1Instance.address,
      MaxUint256
    );
    await this.wmaticTokenInstance.approve(this.uniswapV2Router1Instance.address, MaxUint256);
    await this.rewardToken2Instance.approve(this.uniswapV2Router1Instance.address, MaxUint256);

    await this.uniswapV2Router1Instance.addLiquidity(
      this.yugenFarmRewardTokenInstance.address,
      this.wmaticTokenInstance.address,
      getBigNumber(1000),
      getBigNumber(100),
      0,
      0,
      this.signer.address,
      MaxUint256
    );

    await this.uniswapV2Router1Instance.addLiquidity(
      this.rewardToken2Instance.address,
      this.wmaticTokenInstance.address,
      getBigNumber(500),
      getBigNumber(100),
      0,
      0,
      this.signer.address,
      MaxUint256
    );

    console.log("Liquidity Added for WMATIC and ABC Token");

    await this.ygnTokenInstance.approve(this.uniswapV2Router2Instance.address, MaxUint256);
    await this.wmaticTokenInstance.approve(this.uniswapV2Router2Instance.address, MaxUint256);
    await this.rewardToken1Instance.approve(this.uniswapV2Router2Instance.address, MaxUint256);

    await this.uniswapV2Router2Instance.addLiquidity(
      this.ygnTokenInstance.address,
      this.wmaticTokenInstance.address,
      getBigNumber(500),
      getBigNumber(1000),
      0,
      0,
      this.signer.address,
      MaxUint256
    );

    await this.uniswapV2Router2Instance.addLiquidity(
      this.ygnTokenInstance.address,
      this.rewardToken1Instance.address,
      getBigNumber(500),
      getBigNumber(1000),
      0,
      0,
      this.signer.address,
      MaxUint256
    );

    console.log("Liquidity Added for WMATIC and YGN Token");

    this.lpToken1Address = await this.uniswapV2Factory2Instance.getPair(
      this.wmaticTokenInstance.address,
      this.ygnTokenInstance.address
    );

    this.lpToken2Address = await this.uniswapV2Factory2Instance.getPair(
      this.rewardToken1Instance.address,
      this.ygnTokenInstance.address
    );

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.lpToken1Instance = ERC20Mock.attach(this.lpToken1Address);
    this.lpToken2Instance = ERC20Mock.attach(this.lpToken2Address);
  });

  it("should set correct state variables", async function () {
    const ygn = await this.converterInstance.ygn();
    const fYGNBurner = await this.converterInstance.fYGNBurner();
    const burnerAllocation = await this.converterInstance.burnerAllocation();
    const ygnStaker = await this.converterInstance.ygnStaker();
    const stakersAllocation = await this.converterInstance.stakersAllocation();
    const platformAddr = await this.converterInstance.platformAddr();
    const platformFeesAllocation = await this.converterInstance.platformFeesAllocation();
    const treasury = await this.converterInstance.treasury();
    const treasuryAllocation = await this.converterInstance.treasuryAllocation();
    const owner = await this.converterInstance.owner();
    expect(ygn).to.equal(this.ygnTokenInstance.address);
    expect(ygnStaker).to.equal(ConstructorParams.YGN_STAKER);
    expect(fYGNBurner).to.equal(ConstructorParams.FYGN_BURNER);
    expect(treasury).to.equal(ConstructorParams.TREASURY);
    expect(platformAddr).to.equal(this.platformAddr);
    expect(burnerAllocation).to.equal(Number(ConstructorParams.BURNER_ALLOCATION));
    expect(stakersAllocation).to.equal(Number(ConstructorParams.STAKERS_ALLOCATION));
    expect(platformFeesAllocation).to.equal(Number(ConstructorParams.PLATFORM_FEES_ALLOCATION));
    expect(treasuryAllocation).to.equal(Number(ConstructorParams.TREASURY_ALLOCATION));
    expect(owner).to.equal(this.adminAddress);
  });

  it("should revert if burner address is zero address", async function () {
    await expect(
      this.converterInstance.connect(this.signer).updatefYGNBurner(AddressZero)
    ).to.be.revertedWith("No zero address");
  });

  it("should revert if ygn staker address is zero address", async function () {
    await expect(
      this.converterInstance.connect(this.signer).updateYGNStaker(AddressZero)
    ).to.be.revertedWith("No zero address");
  });

  it("should revert if platform fees address is zero address", async function () {
    await expect(
      this.converterInstance.connect(this.signer).updatePlatformAddress(AddressZero)
    ).to.be.revertedWith("No zero address");
  });

  it("should revert if treasury address is zero address", async function () {
    await expect(
      this.converterInstance.connect(this.signer).updateTreasury(AddressZero)
    ).to.be.revertedWith("No zero address");
  });

  it("should set correctly set the fYGN burner address", async function () {
    await this.converterInstance
      .connect(this.signer)
      .updatefYGNBurner(ConstructorParams.FYGN_BURNER);
    const fYGNBurner = await this.converterInstance.fYGNBurner();
    expect(fYGNBurner).to.equal(ConstructorParams.FYGN_BURNER);
  });

  it("should set correctly set the ygn staker address", async function () {
    await this.converterInstance.connect(this.signer).updateYGNStaker(ConstructorParams.YGN_STAKER);
    const ygnStaker = await this.converterInstance.ygnStaker();
    expect(ygnStaker).to.equal(ConstructorParams.YGN_STAKER);
  });

  it("should set correctly set the platform fees address", async function () {
    await this.converterInstance.connect(this.signer).updatePlatformAddress(this.platformAddr);
    const platformAddr = await this.converterInstance.platformAddr();
    expect(platformAddr).to.equal(this.platformAddr);
  });

  it("should set correctly set the treasury address", async function () {
    await this.converterInstance.connect(this.signer).updateTreasury(ConstructorParams.TREASURY);
    const treasury = await this.converterInstance.treasury();
    expect(treasury).to.equal(ConstructorParams.TREASURY);
  });

  it("should revert if allocation set is incorrect", async function () {
    await expect(
      this.converterInstance.setAllocation(
        7500,
        ConstructorParams.STAKERS_ALLOCATION,
        ConstructorParams.PLATFORM_FEES_ALLOCATION,
        ConstructorParams.TREASURY_ALLOCATION
      )
    ).to.be.revertedWith("invalid allocations");
  });

  it("should correctly set the YGN allocation", async function () {
    await this.converterInstance.setAllocation(
      ConstructorParams.BURNER_ALLOCATION,
      ConstructorParams.STAKERS_ALLOCATION,
      ConstructorParams.PLATFORM_FEES_ALLOCATION,
      ConstructorParams.TREASURY_ALLOCATION
    );
    const burnerAllocation = await this.converterInstance.burnerAllocation();
    const stakersAllocation = await this.converterInstance.stakersAllocation();
    const platformFeesAllocation = await this.converterInstance.platformFeesAllocation();
    const treasuryAllocation = await this.converterInstance.treasuryAllocation();
    expect(burnerAllocation).to.equal(Number(ConstructorParams.BURNER_ALLOCATION));
    expect(stakersAllocation).to.equal(Number(ConstructorParams.STAKERS_ALLOCATION));
    expect(platformFeesAllocation).to.equal(Number(ConstructorParams.PLATFORM_FEES_ALLOCATION));
    expect(treasuryAllocation).to.equal(Number(ConstructorParams.TREASURY_ALLOCATION));
  });

  it("should add token info in the converter", async function () {
    await expect(
      this.converterInstance
        .connect(this.signer1)
        .addTokenDetails(
          AddressZero,
          [this.wmaticTokenInstance.address, this.ygnTokenInstance.address],
          YGN_TOKEN_EXCHANGE_ROUTER
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      this.converterInstance.addTokenDetails(
        AddressZero,
        [this.wmaticTokenInstance.address, this.ygnTokenInstance.address],
        YGN_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("No zero address");
    await expect(
      this.converterInstance.addTokenDetails(
        this.wmaticTokenInstance.address,
        [this.wmaticTokenInstance.address, this.ygnTokenInstance.address],
        AddressZero
      )
    ).to.be.revertedWith("No zero address");
    await expect(
      this.converterInstance.addTokenDetails(
        this.ygnTokenInstance.address,
        [this.wmaticTokenInstance.address, this.ygnTokenInstance.address],
        YGN_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("Token Address should not be YGN");
    await expect(
      this.converterInstance.addTokenDetails(
        this.wmaticTokenInstance.address,
        [],
        YGN_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("Path to YGN is incorrrect/empty");
    await expect(
      this.converterInstance.addTokenDetails(
        this.wmaticTokenInstance.address,
        [this.wmaticTokenInstance.address, this.yugenFarmRewardTokenInstance.address],
        YGN_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("Path should convert to YGN");
    await this.converterInstance.addTokenDetails(
      this.wmaticTokenInstance.address,
      [this.wmaticTokenInstance.address, this.ygnTokenInstance.address],
      YGN_TOKEN_EXCHANGE_ROUTER
    );
    await expect(
      this.converterInstance.addTokenDetails(
        this.wmaticTokenInstance.address,
        [this.wmaticTokenInstance.address, this.ygnTokenInstance.address],
        YGN_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("Token Already Added");
    const tokenIndex = await this.converterInstance.tokenIndexes(this.wmaticTokenInstance.address);
    console.log(`WMATIC Token Added at Index ${tokenIndex} `);
    await expect(
      this.converterInstance.updateTokenPathToYGN(this.ygnTokenInstance.address, [
        this.wmaticTokenInstance.address,
        this.ygnTokenInstance.address,
      ])
    ).to.be.revertedWith("Token does not exist");
    await this.converterInstance.updateTokenRouter(
      this.wmaticTokenInstance.address,
      YGN_TOKEN_EXCHANGE_ROUTER
    );
    await this.converterInstance.updateTokenPathToYGN(this.wmaticTokenInstance.address, [
      this.wmaticTokenInstance.address,
      this.yugenFarmRewardTokenInstance.address,
      this.ygnTokenInstance.address,
    ]);
    await this.converterInstance.updateTokenPathToYGN(this.wmaticTokenInstance.address, [
      this.wmaticTokenInstance.address,
      this.ygnTokenInstance.address,
    ]);
    await this.converterInstance.addTokenDetails(
      this.rewardToken1Instance.address,
      [this.rewardToken1Instance.address, this.ygnTokenInstance.address],
      YGN_TOKEN_EXCHANGE_ROUTER
    );
  });

  it("should add child farm token info in the converter", async function () {
    await expect(
      this.converterInstance
        .connect(this.signer1)
        .addChildFarmTokenDetails(
          AddressZero,
          [this.yugenFarmRewardTokenInstance.address, this.wmaticTokenInstance.address],
          CHILD_TOKEN_EXCHANGE_ROUTER
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      this.converterInstance.addChildFarmTokenDetails(
        AddressZero,
        [this.yugenFarmRewardTokenInstance.address, this.wmaticTokenInstance.address],
        CHILD_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("No zero address");
    await expect(
      this.converterInstance.addChildFarmTokenDetails(
        this.yugenFarmRewardTokenInstance.address,
        [this.yugenFarmRewardTokenInstance.address, this.wmaticTokenInstance.address],
        AddressZero
      )
    ).to.be.revertedWith("No zero address");
    await expect(
      this.converterInstance.addChildFarmTokenDetails(
        this.ygnTokenInstance.address,
        [this.yugenFarmRewardTokenInstance.address, this.wmaticTokenInstance.address],
        CHILD_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("Token Address should not be YGN");
    await expect(
      this.converterInstance.addChildFarmTokenDetails(
        this.yugenFarmRewardTokenInstance.address,
        [],
        CHILD_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("Path to common token is incorrrect/empty");
    await this.converterInstance.addChildFarmTokenDetails(
      this.yugenFarmRewardTokenInstance.address,
      [this.yugenFarmRewardTokenInstance.address, this.wmaticTokenInstance.address],
      CHILD_TOKEN_EXCHANGE_ROUTER
    );
    await expect(
      this.converterInstance.addChildFarmTokenDetails(
        this.yugenFarmRewardTokenInstance.address,
        [this.yugenFarmRewardTokenInstance.address, this.wmaticTokenInstance.address],
        CHILD_TOKEN_EXCHANGE_ROUTER
      )
    ).to.be.revertedWith("Child Farm Token Already Added");
    const childFarmTokenIndex = await this.converterInstance.childFarmTokenIndexes(
      this.yugenFarmRewardTokenInstance.address
    );
    console.log(`ABC Token Added at Index ${childFarmTokenIndex} `);
    await expect(
      this.converterInstance.updateChildFarmTokenPathToCommonToken(this.ygnTokenInstance.address, [
        this.yugenFarmRewardTokenInstance.address,
        this.wmaticTokenInstance.address,
      ])
    ).to.be.revertedWith("Token does not exist");
    await this.converterInstance.updateChildFarmTokenRouter(
      this.yugenFarmRewardTokenInstance.address,
      CHILD_TOKEN_EXCHANGE_ROUTER
    );
    await this.converterInstance.updateChildFarmTokenPathToCommonToken(
      this.yugenFarmRewardTokenInstance.address,
      [
        this.yugenFarmRewardTokenInstance.address,
        this.ygnTokenInstance.address,
        this.wmaticTokenInstance.address,
      ]
    );
    await this.converterInstance.updateChildFarmTokenPathToCommonToken(
      this.yugenFarmRewardTokenInstance.address,
      [this.yugenFarmRewardTokenInstance.address, this.wmaticTokenInstance.address]
    );
    await this.converterInstance.addChildFarmTokenDetails(
      this.rewardToken2Instance.address,
      [this.rewardToken2Instance.address, this.wmaticTokenInstance.address],
      CHILD_TOKEN_EXCHANGE_ROUTER
    );
  });

  it("should add LP token", async function () {
    await expect(
      this.converterInstance.connect(this.signer1).addLPTokenDetails(AddressZero)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(this.converterInstance.addLPTokenDetails(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
    await expect(
      this.converterInstance.addLPTokenDetails(this.ygnTokenInstance.address)
    ).to.be.revertedWith("Token Address should not be YGN");
    await this.converterInstance.addLPTokenDetails(this.lpToken1Address);
    await expect(this.converterInstance.addLPTokenDetails(this.lpToken1Address)).to.be.revertedWith(
      "LP Token Already Added"
    );
    const lpTokenIndex = await this.converterInstance.lpTokenIndexes(this.lpToken1Address);
    console.log(`LP Token Added at Index ${lpTokenIndex} `);
    await this.converterInstance.addLPTokenDetails(this.lpToken2Address);
  });

  it("should revert if token is zero address", async function () {
    await expect(this.converterInstance.convertLPToken(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
    await expect(this.converterInstance.convertChildFarmToken(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
    await expect(this.converterInstance.convertToken(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
  });

  it("should return total number of tokens of all types", async function () {
    expect(await this.converterInstance.totalTokens()).to.equal(3);
    expect(await this.converterInstance.totalChildFarmTokens()).to.equal(3);
    expect(await this.converterInstance.totalLPTokens()).to.equal(3);
  });

  it("should revert if token to convert is YGN", async function () {
    await expect(
      this.converterInstance.convertToken(this.ygnTokenInstance.address)
    ).to.be.revertedWith("Token does not exist");
    await expect(
      this.converterInstance.convertLPToken(this.ygnTokenInstance.address)
    ).to.be.revertedWith("LP Token does not exist");
    await expect(
      this.converterInstance.convertChildFarmToken(this.ygnTokenInstance.address)
    ).to.be.revertedWith("Child Farm Token does not exist");
  });

  it("should correctly call convertChildToken function and correctly convert child farm tokens to wmatic", async function () {
    const wmaticBalanceInConverterBeforeConvert = await this.wmaticTokenInstance.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance before", Number(wmaticBalanceInConverterBeforeConvert));
    expect(Number(wmaticBalanceInConverterBeforeConvert)).to.equal(0);
    await this.yugenFarmRewardTokenInstance.transfer(
      this.converterInstance.address,
      getBigNumber(200)
    );
    await this.rewardToken2Instance.transfer(this.converterInstance.address, getBigNumber(200));
    await this.converterInstance.convertChildFarmTokens();
    const wmaticBalanceInConverterAfterConvert = await this.wmaticTokenInstance.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance after", Number(wmaticBalanceInConverterAfterConvert));
    expect(Number(wmaticBalanceInConverterAfterConvert)).to.be.greaterThan(0);
  });

  it("should correctly call convertLPTokens", async function () {
    const ygnBalanceInConverterBeforeConvert = await this.ygnTokenInstance.balanceOf(
      this.converterInstance.address
    );
    console.log("YGN Balance before", Number(ygnBalanceInConverterBeforeConvert) / 10 ** 18);
    const wmaticBalanceInConverterBeforeConvert = await this.wmaticTokenInstance.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance before", Number(wmaticBalanceInConverterBeforeConvert) / 10 ** 18);
    const rewardToken1BalanceInConverterBeforeConvert = await this.rewardToken1Instance.balanceOf(
      this.converterInstance.address
    );
    console.log(
      "Reward Token Balance before",
      Number(rewardToken1BalanceInConverterBeforeConvert) / 10 ** 18
    );
    const lp1BalanceWithSigner = await this.lpToken1Instance.balanceOf(this.signer.address);
    const lp2BalanceWithSigner = await this.lpToken2Instance.balanceOf(this.signer.address);
    console.log(
      "LP Balances with Signer",
      Number(lp1BalanceWithSigner) / 10 ** 18,
      Number(lp2BalanceWithSigner) / 10 ** 18
    );
    console.log(
      "Transferring LPs to Converter",
      Number(lp1BalanceWithSigner.div(100)) / 10 ** 18,
      Number(lp2BalanceWithSigner.div(100)) / 10 ** 18
    );
    await this.lpToken1Instance.transfer(
      this.converterInstance.address,
      lp1BalanceWithSigner.div(100)
    );
    await this.lpToken2Instance.transfer(
      this.converterInstance.address,
      lp2BalanceWithSigner.div(100)
    );
    await this.converterInstance.convertLPTokens();
    const ygnBalanceInConverterAfterConvert = await this.ygnTokenInstance.balanceOf(
      this.converterInstance.address
    );
    console.log("YGN Balance after", Number(ygnBalanceInConverterAfterConvert) / 10 ** 18);
    const wmaticBalanceInConverterAfterConvert = await this.wmaticTokenInstance.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance after", Number(wmaticBalanceInConverterAfterConvert) / 10 ** 18);
    const rewardToken1BalanceInConverterAfterConvert = await this.rewardToken1Instance.balanceOf(
      this.converterInstance.address
    );
    console.log(
      "Reward Token Balance after",
      Number(rewardToken1BalanceInConverterAfterConvert) / 10 ** 18
    );
  });

  it("should correctly call convertToYGN function and correctly wmatic to YGN", async function () {
    const ygnBalanceInConverterBeforeConvert = await this.ygnTokenInstance.balanceOf(
      ConstructorParams.FYGN_BURNER
    );
    console.log("YGN Balance before", Number(ygnBalanceInConverterBeforeConvert));
    expect(Number(ygnBalanceInConverterBeforeConvert)).to.equal(0);
    const tx = await this.converterInstance.convertToken(this.wmaticTokenInstance.address);
    const ygnBalanceInConverterAfterConvert = await this.ygnTokenInstance.balanceOf(
      ConstructorParams.FYGN_BURNER
    );
    console.log("YGN Balance after", Number(ygnBalanceInConverterAfterConvert));
    expect(Number(ygnBalanceInConverterAfterConvert)).to.be.greaterThan(0);
    const txReceipt = await tx.wait();
    const ygnConvertedEventLogs = txReceipt.events.filter((x) => {
      return x.event == "YGNConverted";
    });
    expect(ygnConvertedEventLogs.length).to.be.greaterThan(0);
    const { args } = ygnConvertedEventLogs[0];
    expect(args).to.be.haveOwnProperty("burnerAllocated");
    expect(args).to.be.haveOwnProperty("stakersAllocated");
    expect(args).to.be.haveOwnProperty("platformFees");
    expect(args).to.be.haveOwnProperty("treasuryAllocated");
    const { burnerAllocated, stakersAllocated, platformFees, treasuryAllocated } = args;
    expect(Number(burnerAllocated)).to.be.greaterThan(0);
    expect(Number(stakersAllocated)).to.be.greaterThan(0);
    expect(Number(platformFees)).to.be.greaterThan(0);
    expect(Number(treasuryAllocated)).to.be.greaterThan(0);
  });

  it("should be able to rescue funds for the owner", async function () {
    await this.ygnTokenInstance.transfer(this.converterInstance.address, getBigNumber(1));
    const converterYGNBalance = await this.ygnTokenInstance.balanceOf(
      this.converterInstance.address
    );
    const beforeYGNBalanceOwner = await this.ygnTokenInstance.balanceOf(this.signer.address);

    await this.converterInstance.connect(this.signer).rescueFunds(this.ygnTokenInstance.address);
    const afterYGNBalanceOwner = await this.ygnTokenInstance.balanceOf(this.signer.address);
    expect(afterYGNBalanceOwner.sub(beforeYGNBalanceOwner)).to.be.equal(converterYGNBalance);
  });
});
