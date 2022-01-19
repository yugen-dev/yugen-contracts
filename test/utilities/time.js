const { ethers } = require("hardhat");

const advanceBlock = async () => {
  return ethers.provider.send("evm_mine", []);
};

const advanceBlockTo = async (blockNumber) => {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock();
  }
};

const advanceTime = async function (time) {
  await ethers.provider.send("evm_increaseTime", [time]);
};

module.exports = { advanceBlockTo, advanceTime, advanceBlock };
