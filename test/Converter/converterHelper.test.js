const { ethers } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
chai.use(solidity);
const { expect } = chai;
const { AddressZero } = ethers.constants;

describe("Converter Helper Contract", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.signer = this.signers[0];
    this.signer1 = this.signers[1];

    const UniversalConverterHelper = await ethers.getContractFactory("UniversalConverterHelper");
    this.converterHelperInstance = await UniversalConverterHelper.deploy();
    await this.converterHelperInstance.deployed();
    console.log("Converter Helper deployed at " + this.converterHelperInstance.address);

    const Converter = await ethers.getContractFactory("UniversalConverter");
    this.converterInstance = await Converter.attach("0x1188772c9810CfECAc6c35fFdE41A710983b01Ec");

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    this.nshare = ERC20Mock.attach("0x948d0a28b600bdbd77af4ea30e6f338167034181");
    this.etha = ERC20Mock.attach("0x59e9261255644c411afdd00bd89162d09d862e38");
  });

  it("should add strategy", async function () {
    const strategyAddress = "0x9634A9317CcbBb9c5da79311AE337845d13ff6C7";
    await expect(
      this.converterHelperInstance.connect(this.signer1).addStrategy(AddressZero)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(this.converterHelperInstance.addStrategy(AddressZero)).to.be.revertedWith(
      "No zero address"
    );
    await this.converterHelperInstance.addStrategy(strategyAddress);
    await expect(this.converterHelperInstance.addStrategy(strategyAddress)).to.be.revertedWith(
      "Strategy Already Added"
    );
    const strategyIndex = await this.converterHelperInstance.strategyIndexes(strategyAddress);
    console.log(`Strategy Added at Index ${strategyIndex} `);

    await expect(
      this.converterHelperInstance.updateStrategyStatus(AddressZero, true)
    ).to.be.revertedWith("No zero address");
    await expect(
      this.converterHelperInstance.updateStrategyStatus(this.signer.address, true)
    ).to.be.revertedWith("Strategy Address does not exist");
    await this.converterHelperInstance.updateStrategyStatus(strategyAddress, true);

    const strategies = [
      "0x7B0b73E1873A911d76cbc04881e61B7B4627266b",
      "0x29406DD389334dbBF23966fdd903c6De932e112C",
      "0xE7A88111269875FE5793A1831C22197422CfC604",
      "0x261f779419016b86BA8e663a4Eb73b39CB4F813b",
      "0xf0d9b1A785f729901F9697F89dF5E4079dF0f730",
      "0x017AE400cd59E47608eE77241E7143a668Cf8DdC",
      "0x77d2286b79AC8D6615e5dfeCde33570017444F3f",
      "0x126219afdea0b3b750A58822e71F2271a73E0822",
      "0x4585A780F83d81f5A31fd5e07328ac53df54e2D5",
      "0x50EF226fFB852Fb34fF6367E2Fc9730f11Cce1EB",
    ];
    await this.converterHelperInstance.addStrategies(strategies);

    await expect(this.converterHelperInstance.addStrategies(strategies)).to.be.revertedWith(
      "Strategy Already Added"
    );
    await expect(this.converterHelperInstance.addStrategies([AddressZero])).to.be.revertedWith(
      "No zero address"
    );
  });

  it("should return total number of tokens of all types", async function () {
    expect(await this.converterHelperInstance.totalStrategies()).to.equal(12);
  });

  it("should correctly call update pool in valid stratgies", async function () {
    const nshareBalanceBefore = await this.nshare.balanceOf(this.converterInstance.address);
    console.log(`NShare balance in Converter before update pools - ${String(nshareBalanceBefore)}`);
    await this.converterHelperInstance.updatePoolForAllStrategies();
    const nshareBalanceAfter = await this.nshare.balanceOf(this.converterInstance.address);
    console.log(`NShare balance in Converter after update pools - ${String(nshareBalanceAfter)}`);

    const ethaBalanceBefore = await this.etha.balanceOf(this.converterInstance.address);
    console.log(`ETHA balance in Converter before update pools - ${String(ethaBalanceBefore)}`);
    const strategies = [
      "0x4585A780F83d81f5A31fd5e07328ac53df54e2D5",
      "0x50EF226fFB852Fb34fF6367E2Fc9730f11Cce1EB",
    ];
    await this.converterHelperInstance.updatePools(strategies);
    const ethaBalanceAfter = await this.etha.balanceOf(this.converterInstance.address);
    console.log(`ETHA balance in Converter after update pools - ${String(ethaBalanceAfter)}`);
    await expect(this.converterHelperInstance.updatePools([AddressZero])).to.be.revertedWith(
      "No zero address"
    );
  });
});
