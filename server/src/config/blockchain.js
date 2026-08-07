const { ethers } = require("ethers");

// The provider is created lazily and never kills the process. A missing or
// unreachable RPC should degrade the chain-backed routes, not stop the API
// from serving auth and the asset registry.

let provider = null;

function getProvider() {
    if (provider) return provider;

    if (!process.env.SEPOLIA_RPC_URL) {
        console.warn("[Blockchain] ⚠️  SEPOLIA_RPC_URL is not set — chain routes are disabled.");
        return null;
    }

    provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    console.log("[Blockchain] 🔗 Provider initialised.");
    return provider;
}

module.exports = { getProvider };
