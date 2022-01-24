require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INFURA_API = process.env.INFURA_API;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL;

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: INFURA_API,
      },
    },
    localhost: {
      url: "http://localhost:8545",
    },
    matic: {
      url: INFURA_API,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    mumbai: {
      url: INFURA_API,
      accounts: [`0x${PRIVATE_KEY}`],
      gasPrice: 8000000000, // default is 'auto' which breaks chains without the london hardfork
    },
    eth_mainnet: {
      url: ETHEREUM_RPC_URL,
      accounts: [`0x${PRIVATE_KEY}`],
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: ETHERSCAN_API_KEY,
  },
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 2000000,
  },
};
