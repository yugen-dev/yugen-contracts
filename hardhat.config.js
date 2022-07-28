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
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const ETHEREUM_MAINNET_RPC_URL = process.env.ETHEREUM_MAINNET_RPC_URL;

const FANTOM_MAINNET_RPC_URL = process.env.FANTOM_MAINNET_RPC_URL;
const FANTOM_TESTNET_RPC_URL = process.env.FANTOM_TESTNET_RPC_URL;

const POLYGON_MAINNET_RPC_URL = process.env.POLYGON_MAINNET_RPC_URL;
const POLYGON_TESTNET_RPC_URL = process.env.POLYGON_TESTNET_RPC_URL;

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    hardhat: {
      forking: {
        url: FANTOM_MAINNET_RPC_URL,
      },
    },
    localhost: {
      url: "http://localhost:8545",
    },
    matic: {
      url: POLYGON_MAINNET_RPC_URL,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    mumbai: {
      url: POLYGON_TESTNET_RPC_URL,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    eth_mainnet: {
      url: ETHEREUM_MAINNET_RPC_URL,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    fantom_mainnet: {
      url: FANTOM_MAINNET_RPC_URL,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    fantom_testnet: {
      url: FANTOM_TESTNET_RPC_URL,
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
