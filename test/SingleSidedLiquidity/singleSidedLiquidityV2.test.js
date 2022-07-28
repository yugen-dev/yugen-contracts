const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { MaxUint256, AddressZero } = ethers.constants;
const ConstructorParams = {
  router: "0xbE75Dd16D029c6B32B7aD57A0FD9C1c20Dd2862e", //dyst router
  weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", //wmatic
};
const { getBigNumber } = require("../utilities/index");

//Test cases based on forked mainnet testing
describe.only("Single Sided Liquidity V2 (Dyst like exchanges) Test Suite", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];

    const SingleSidedLiquidityV2 = await hre.ethers.getContractFactory("SingleSidedLiquidityV2");
    this.singleSidedLiquidityV2Instance = await SingleSidedLiquidityV2.deploy(
      ConstructorParams.router,
      ConstructorParams.weth
    );

    console.log(
      "SingleSidedLiquidityV2 contract deployed at:",
      this.singleSidedLiquidityV2Instance.address
    );

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.usdc = ERC20Mock.attach("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
    this.dystRouter = "0xbE75Dd16D029c6B32B7aD57A0FD9C1c20Dd2862e";
    this.dyst = ERC20Mock.attach("0x39aB6574c289c3Ae4d88500eEc792AB5B947A5Eb");
    this.pen = ERC20Mock.attach("0x9008D70A5282a936552593f410AbcBcE2F891A97");
    this.wmatic = ERC20Mock.attach("0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270");
    this.lpToken1 = ERC20Mock.attach("0x421a018cC5839c4C0300AfB21C725776dc389B1a"); //USDC-USDC+ LP
    this.lpToken2 = ERC20Mock.attach("0x1e08a5b6a1694bc1a65395db6f4c506498daa349"); //DYST-WMATIC LP

    const dystHolderSigner = "0x6b5D08C3B88E556A0fb330483404d140c9488e0f";
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [dystHolderSigner],
    });
    this.dystHolderSigner = await ethers.getSigner(dystHolderSigner);
    await this.dyst
      .connect(this.dystHolderSigner)
      .approve(
        this.singleSidedLiquidityV2Instance.address,
        ethers.BigNumber.from("3300000000000000000")
      );
  });

  it("should pool single sided liqudiity", async function () {
    //check lp balance before
    console.log(await this.lpToken2.balanceOf(this.dystHolderSigner.address));
    await this.singleSidedLiquidityV2Instance
      .connect(this.dystHolderSigner)
      .poolLiquidity(
        this.dystHolderSigner.address,
        this.dyst.address,
        ethers.BigNumber.from("3300000000000000000"),
        this.lpToken2.address,
        this.wmatic.address,
        1,
        false
      );
    console.log(await this.lpToken2.balanceOf(this.dystHolderSigner.address));
  });
});
