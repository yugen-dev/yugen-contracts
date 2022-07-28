const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const ConstructorParams = require("../../scripts/dyst_converter.json");
const { getBigNumber } = require("../utilities/index");

//Test cases based on forked mainnet testing
describe("DystConverter Test Suite", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.signer1 = this.signers[1];

    const UniversalConverter = await hre.ethers.getContractFactory("UniversalConverter");
    this.universalConverterInstance = UniversalConverter.attach(ConstructorParams.ygnConverter);

    const DystConverter = await hre.ethers.getContractFactory("DystConverter");
    this.converterInstance = await DystConverter.deploy(
      ConstructorParams.usdc,
      ConstructorParams.ygnConverter
    );
    await this.converterInstance.deployed();
    console.log("DystConverter deployed at " + this.converterInstance.address);

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.dystRouter = "0xbE75Dd16D029c6B32B7aD57A0FD9C1c20Dd2862e";
    this.usdc = ERC20Mock.attach(ConstructorParams.usdc);
    this.ygn = ERC20Mock.attach(ConstructorParams.ygn);
    this.dyst = ERC20Mock.attach("0x39aB6574c289c3Ae4d88500eEc792AB5B947A5Eb");
    this.pen = ERC20Mock.attach("0x9008D70A5282a936552593f410AbcBcE2F891A97");
    this.usdPlus = ERC20Mock.attach("0x236eeC6359fb44CCe8f97E99387aa7F8cd5cdE1f");
    this.wmatic = ERC20Mock.attach("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270");
    this.lpToken1 = ERC20Mock.attach("0x421a018cC5839c4C0300AfB21C725776dc389B1a"); //USDC-USDC+ LP
    this.lpToken2 = ERC20Mock.attach("0x1e08a5b6a1694bc1a65395db6f4c506498daa349"); //DYST-WMATIC LP

    console.log("Transferring LPs to Converter");
    const lp1Depositor = "0xdB28E475a2Ee3bF9B99A2720D612cF3e289C23C4";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [lp1Depositor],
    });
    const lp1DepositorSigner = await ethers.getSigner(lp1Depositor);
    await this.lpToken1
      .connect(lp1DepositorSigner)
      .transfer(this.converterInstance.address, ethers.BigNumber.from("200000000"));
    const lp2Depositor = "0xed9a912182745fe101ecb4291d00b802d982ba0f";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [lp2Depositor],
    });
    const lp2DepositorSigner = await ethers.getSigner(lp2Depositor);
    await this.lpToken2
      .connect(lp2DepositorSigner)
      .transfer(this.converterInstance.address, ethers.BigNumber.from("3300000000000"));
  });

  it("should set correct state variables after deployment", async function () {
    const usdc = await this.converterInstance.usdc();
    const owner = await this.converterInstance.owner();
    const ygnConverter = await this.converterInstance.ygnConverter();
    expect(usdc).to.equal(this.usdc.address);
    expect(owner).to.equal(this.signer.address);
    expect(ygnConverter).to.equal(this.universalConverterInstance.address);
  });

  it("should set filler tokens and filler LP tokens correctly in constructor after deployment", async function () {
    const totalTokens = await this.converterInstance.totalTokens();
    const totalLPTokens = await this.converterInstance.totalLPTokens();
    const firstTokenInfo = await this.converterInstance.tokenInfo(0);
    const firstTokenIndex = await this.converterInstance.tokenIndexes(AddressZero);
    const firstLPTokenInfo = await this.converterInstance.lpTokenInfo(0);
    const firstLPTokenIndex = await this.converterInstance.lpTokenIndexes(AddressZero);
    expect(totalTokens).to.equal(1);
    expect(totalLPTokens).to.equal(1);
    expect(firstLPTokenInfo).to.equal(AddressZero);
    expect(firstLPTokenIndex).to.equal(0);
    expect(firstTokenIndex).to.equal(0);
    expect(firstTokenInfo["router"]).to.equal(AddressZero);
    expect(firstTokenInfo["token"]).to.equal(AddressZero);
    //comeback here again after seeing how first token is added
    // console.log(firstTokenInfo);
    // expect(firstTokenInfo["pathToUSDC"][0]["from"]).to.equal(AddressZero);
    // expect(firstTokenInfo["pathToUSDC"][0]["to"]).to.equal(AddressZero);
    // expect(firstTokenInfo["pathToUSDC"][0]["stable"]).to.equal(false);
  });

  it("should revert if ygn converter address is zero address", async function () {
    await expect(this.converterInstance.setYGNConverter(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
  });

  it("should add token info in the converter", async function () {
    await expect(
      this.converterInstance
        .connect(this.signer1)
        .addTokenDetails(
          AddressZero,
          [{ from: this.dyst.address, to: this.usdc.address, stable: false }],
          this.dystRouter
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      this.converterInstance.addTokenDetails(
        AddressZero,
        [{ from: this.dyst.address, to: this.usdc.address, stable: false }],
        this.dystRouter
      )
    ).to.be.revertedWith("No zero address");
    await expect(
      this.converterInstance.addTokenDetails(
        this.dyst.address,
        [{ from: this.dyst.address, to: this.usdc.address, stable: false }],
        AddressZero
      )
    ).to.be.revertedWith("No zero address");
    await expect(
      this.converterInstance.addTokenDetails(
        this.usdc.address,
        [{ from: this.dyst.address, to: this.usdc.address, stable: false }],
        this.dystRouter
      )
    ).to.be.revertedWith("Token Address should not be USDC");
    await expect(
      this.converterInstance.addTokenDetails(this.dyst.address, [], this.dystRouter)
    ).to.be.revertedWith("Path to USDC is incorrrect/empty");
    await expect(
      this.converterInstance.addTokenDetails(
        this.dyst.address,
        [{ from: this.dyst.address, to: this.dyst.address, stable: false }],
        this.dystRouter
      )
    ).to.be.revertedWith("Path should convert to USDC");
    await this.converterInstance.addTokenDetails(
      this.dyst.address,
      [
        { from: this.dyst.address, to: this.wmatic.address, stable: false },
        { from: this.wmatic.address, to: this.usdc.address, stable: false },
      ],
      this.dystRouter
    );
    await expect(
      this.converterInstance.addTokenDetails(
        this.dyst.address,
        [
          { from: this.dyst.address, to: this.wmatic.address, stable: false },
          { from: this.wmatic.address, to: this.usdc.address, stable: false },
        ],
        this.dystRouter
      )
    ).to.be.revertedWith("Token Already Added");
    let tokenIndex = await this.converterInstance.tokenIndexes(this.dyst.address);
    console.log(`DYST Token Added at Index ${tokenIndex} `);
    expect(tokenIndex).to.equal(1);
    await this.converterInstance.updateTokenRouter(this.dyst.address, this.dystRouter);
    await expect(
      this.converterInstance.updateTokenPathToUSDC(this.ygn.address, [
        { from: this.dyst.address, to: this.wmatic.address, stable: false },
        { from: this.wmatic.address, to: this.usdc.address, stable: false },
      ])
    ).to.be.revertedWith("Token does not exist");
    await expect(
      this.converterInstance.updateTokenPathToUSDC(this.dyst.address, [
        { from: this.dyst.address, to: this.wmatic.address, stable: false },
      ])
    ).to.be.revertedWith("Path should convert to USDC");
    await this.converterInstance.updateTokenPathToUSDC(this.dyst.address, [
      { from: this.dyst.address, to: this.usdc.address, stable: false },
    ]);
    await this.converterInstance.updateTokenPathToUSDC(this.dyst.address, [
      { from: this.dyst.address, to: this.wmatic.address, stable: false },
      { from: this.wmatic.address, to: this.usdc.address, stable: false },
    ]);
    await this.converterInstance.addTokenDetails(
      this.wmatic.address,
      [{ from: this.wmatic.address, to: this.usdc.address, stable: false }],
      this.dystRouter
    );
    tokenIndex = await this.converterInstance.tokenIndexes(this.wmatic.address);
    expect(tokenIndex).to.equal(2);
    console.log(`WMATIC Token Added at Index ${tokenIndex} `);
    await this.converterInstance.addTokenDetails(
      this.usdPlus.address,
      [{ from: this.usdPlus.address, to: this.usdc.address, stable: true }],
      this.dystRouter
    );
    await this.converterInstance.addTokenDetails(
      this.pen.address,
      [
        { from: this.pen.address, to: this.wmatic.address, stable: false },
        { from: this.wmatic.address, to: this.usdc.address, stable: false },
      ],
      this.dystRouter
    );
  });

  it("should add LP token", async function () {
    await expect(
      this.converterInstance.connect(this.signer1).addLPTokenDetails(AddressZero)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(this.converterInstance.addLPTokenDetails(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
    await expect(this.converterInstance.addLPTokenDetails(this.usdc.address)).to.be.revertedWith(
      "Token Address should not be USDC"
    );
    await this.converterInstance.addLPTokenDetails(this.lpToken1.address);
    await expect(
      this.converterInstance.addLPTokenDetails(this.lpToken1.address)
    ).to.be.revertedWith("LP Token Already Added");
    let lpTokenIndex = await this.converterInstance.lpTokenIndexes(this.lpToken1.address);
    expect(lpTokenIndex).to.equal(1);
    console.log(`LP Token Added at Index ${lpTokenIndex} `);
    await this.converterInstance.addLPTokenDetails(this.lpToken2.address);
    lpTokenIndex = await this.converterInstance.lpTokenIndexes(this.lpToken2.address);
    expect(lpTokenIndex).to.equal(2);
    console.log(`LP Token Added at Index ${lpTokenIndex} `);
  });

  it("should revert if token is zero address", async function () {
    await expect(this.converterInstance.convertLPToken(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
    await expect(this.converterInstance.convertToken(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
  });

  it("should return total number of tokens of all types", async function () {
    expect(await this.converterInstance.totalTokens()).to.equal(5);
    expect(await this.converterInstance.totalLPTokens()).to.equal(3);
  });

  it("should revert if token to convert is USDC", async function () {
    await expect(this.converterInstance.convertToken(this.usdc.address)).to.be.revertedWith(
      "Token does not exist"
    );
    await expect(this.converterInstance.convertLPToken(this.usdc.address)).to.be.revertedWith(
      "LP Token does not exist"
    );
  });

  it("should correctly call convertLPTokens", async function () {
    const usdcBalanceInConverterBeforeConvert = await this.usdc.balanceOf(
      this.converterInstance.address
    );
    console.log("USDC Balance before", Number(usdcBalanceInConverterBeforeConvert) / 10 ** 18);
    const usdcPlusBalanceInConverterBeforeConvert = await this.usdPlus.balanceOf(
      this.converterInstance.address
    );
    console.log(
      "USDC Plus Balance before",
      Number(usdcPlusBalanceInConverterBeforeConvert) / 10 ** 18
    );
    const wmaticBalanceInConverterBeforeConvert = await this.wmatic.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance before", Number(wmaticBalanceInConverterBeforeConvert) / 10 ** 18);
    const dystBalanceInConverterBeforeConvert = await this.dyst.balanceOf(
      this.converterInstance.address
    );
    console.log("DYST Balance before", Number(dystBalanceInConverterBeforeConvert) / 10 ** 18);

    const lp1BalanceInConverterBeforeConvert = await this.lpToken1.balanceOf(
      this.converterInstance.address
    );
    console.log("LP1 Balance before", Number(lp1BalanceInConverterBeforeConvert) / 10 ** 18);
    const lp2BalanceInConverterBeforeConvert = await this.lpToken2.balanceOf(
      this.converterInstance.address
    );
    console.log("LP2 Balance before", Number(lp2BalanceInConverterBeforeConvert) / 10 ** 18);

    await this.converterInstance.convertLPTokens();

    const usdcBalanceInConverterAfterConvert = await this.usdc.balanceOf(
      this.converterInstance.address
    );
    console.log("USDC Balance after", Number(usdcBalanceInConverterAfterConvert) / 10 ** 18);
    const usdcPlusBalanceInConverterAfterConvert = await this.usdPlus.balanceOf(
      this.converterInstance.address
    );
    console.log(
      "USDC Plus Balance after",
      Number(usdcPlusBalanceInConverterAfterConvert) / 10 ** 18
    );
    const wmaticBalanceInConverterAfterConvert = await this.wmatic.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance after", Number(wmaticBalanceInConverterAfterConvert) / 10 ** 18);
    const dystBalanceInConverterAfterConvert = await this.dyst.balanceOf(
      this.converterInstance.address
    );
    console.log("DYST Token Balance after", Number(dystBalanceInConverterAfterConvert) / 10 ** 18);

    const lp1BalanceInConverterAfterConvert = await this.lpToken1.balanceOf(
      this.converterInstance.address
    );
    console.log("LP1 Balance After", Number(lp1BalanceInConverterAfterConvert) / 10 ** 18);
    const lp2BalanceInConverterAfterConvert = await this.lpToken2.balanceOf(
      this.converterInstance.address
    );
    console.log("LP2 Balance After", Number(lp2BalanceInConverterAfterConvert) / 10 ** 18);
  });

  it("should correctly call convertToUSDC function and correctly convert wmatic and dyst to USDC", async function () {
    //Sending Tokens WMATIC and DYST to Converter

    const usdcBalanceInConverterBeforeConvert = await this.usdc.balanceOf(
      this.converterInstance.address
    );
    console.log("USDC Balance before", Number(usdcBalanceInConverterBeforeConvert) / 10 ** 6);
    expect(Number(usdcBalanceInConverterBeforeConvert)).to.be.greaterThan(0);

    const usdcBalanceInYGNConverterBeforeConvert = await this.usdc.balanceOf(
      this.universalConverterInstance.address
    );
    console.log(
      "USDC Balance before in YGN Converter",
      Number(usdcBalanceInYGNConverterBeforeConvert) / 10 ** 6
    );
    expect(Number(usdcBalanceInYGNConverterBeforeConvert)).to.equal(0);

    const wmaticBalanceInConverterBeforeConvert = await this.wmatic.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance before", Number(wmaticBalanceInConverterBeforeConvert) / 10 ** 18);
    expect(Number(wmaticBalanceInConverterBeforeConvert)).to.be.greaterThan(0);

    const dystBalanceInConverterBeforeConvert = await this.dyst.balanceOf(
      this.converterInstance.address
    );
    console.log("DYST Balance before", Number(dystBalanceInConverterBeforeConvert) / 10 ** 18);
    expect(Number(dystBalanceInConverterBeforeConvert)).to.be.greaterThan(0);

    const usdPlusBalanceInConverterBeforeConvert = await this.usdPlus.balanceOf(
      this.converterInstance.address
    );
    console.log(
      "USD Plus Balance before",
      Number(usdPlusBalanceInConverterBeforeConvert) / 10 ** 6
    );
    expect(Number(usdPlusBalanceInConverterBeforeConvert)).to.be.greaterThan(0);

    await this.converterInstance.convertTokens();

    const usdcBalanceInConverterAfterConvert = await this.usdc.balanceOf(
      this.converterInstance.address
    );
    console.log("USDC Balance after", Number(usdcBalanceInConverterAfterConvert));
    expect(Number(usdcBalanceInConverterAfterConvert)).to.equal(0);

    const wmaticBalanceInConverterAfterConvert = await this.wmatic.balanceOf(
      this.converterInstance.address
    );
    console.log("WMATIC Balance after", Number(wmaticBalanceInConverterAfterConvert));
    expect(Number(wmaticBalanceInConverterAfterConvert)).to.equal(0);

    const dystBalanceInConverterAfterConvert = await this.dyst.balanceOf(
      this.converterInstance.address
    );
    console.log("DYST Balance after", Number(dystBalanceInConverterAfterConvert));
    expect(Number(dystBalanceInConverterAfterConvert)).to.equal(0);

    const usdPlusBalanceInConverterAfterConvert = await this.usdPlus.balanceOf(
      this.converterInstance.address
    );
    console.log("USD Plus Balance after", Number(usdPlusBalanceInConverterAfterConvert));
    expect(Number(usdPlusBalanceInConverterAfterConvert)).to.equal(0);

    const usdcBalanceInYGNConverterAfterConvert = await this.usdc.balanceOf(
      this.universalConverterInstance.address
    );
    console.log(
      "USDC Balance after in YGN Converter",
      Number(usdcBalanceInYGNConverterAfterConvert) / 10 ** 6
    );
    expect(Number(usdcBalanceInYGNConverterAfterConvert)).to.be.greaterThan(0);

    const ygnBalanceInYGNConverterBeforeConvert = await this.ygn.balanceOf(
      this.universalConverterInstance.address
    );
    console.log(
      "YGN Balance after in YGN Converter",
      Number(ygnBalanceInYGNConverterBeforeConvert) / 10 ** 18
    );

    await this.universalConverterInstance.convertTokens();

    const ygnBalanceInYGNConverterAfterConvert = await this.ygn.balanceOf(
      this.universalConverterInstance.address
    );
    console.log(
      "YGN Balance after in YGN Converter",
      Number(ygnBalanceInYGNConverterAfterConvert) / 10 ** 18
    );

    const usdcBalanceInYGNConverterAfterAfterConvert = await this.usdc.balanceOf(
      this.universalConverterInstance.address
    );
    console.log(
      "USDC Balance after in YGN Converter",
      Number(usdcBalanceInYGNConverterAfterAfterConvert) / 10 ** 6
    );
  });

  //rescue USD+
  it("should be able to rescue funds for the owner", async function () {
    const converterUSDPlusBalanceBefore = await this.usdPlus.balanceOf(
      this.converterInstance.address
    );
    console.log("USD Plus Balance before", Number(converterUSDPlusBalanceBefore));
    const ownerUSDPlusBalanceBefore = await this.usdPlus.balanceOf(this.signer.address);
    console.log("USD Plus Balance before", Number(ownerUSDPlusBalanceBefore));

    await this.converterInstance.connect(this.signer).rescueFunds(this.usdPlus.address);
    const converterUSDPlusBalanceAfter = await this.usdPlus.balanceOf(
      this.converterInstance.address
    );
    console.log("USD Plus Balance after", Number(converterUSDPlusBalanceAfter));
    const ownerUSDPlusBalanceAfter = await this.usdPlus.balanceOf(this.signer.address);
    console.log("USD Plus Balance after", Number(ownerUSDPlusBalanceAfter));
    expect(ownerUSDPlusBalanceAfter.sub(ownerUSDPlusBalanceBefore)).to.be.equal(
      converterUSDPlusBalanceBefore
    );
  });
});
