require("@nomicfoundation/hardhat-toolbox");
const path = require("path");

// Resolved against this file, not the working directory — so `hardhat test`
// finds the same .env whether it is run from chain/, from the repo root, or
// on Windows where a bare "../server/.env" would depend on the shell's cwd.
require("dotenv").config({
  path: path.resolve(__dirname, "..", "server", ".env"),
  quiet: true,
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      // The contract is deployed and verified with the optimizer on; keeping
      // the same settings here means the local bytecode matches Sepolia.
      optimizer: { enabled: true, runs: 200 },
      // OpenZeppelin v5 uses `mcopy`, which needs Cancun. Sepolia is on Cancun.
      evmVersion: "cancun",
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
  },
};
