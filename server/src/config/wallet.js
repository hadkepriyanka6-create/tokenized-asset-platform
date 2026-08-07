const { ethers } = require("ethers");
const { getProvider } = require("./blockchain");

// The server wallet is the platform operator: it holds the on-chain admin,
// compliance, issuer and pauser roles. Investors sign their own purchases,
// sales and transfers from their own wallet in the browser — the server key
// is never used on a holder's behalf.

let wallet = null;

function getSigner() {
    if (wallet) return wallet;

    const provider = getProvider();
    if (!provider) return null;

    if (!process.env.PRIVATE_KEY) {
        console.warn("[Wallet] ⚠️  PRIVATE_KEY is not set — operator write routes are disabled.");
        return null;
    }

    try {
        wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    } catch (error) {
        console.error(`[Wallet] ❌ PRIVATE_KEY is not a valid key: ${error.message}`);
        return null;
    }

    console.log(`[Wallet] ✅ Operator wallet ready: ${wallet.address}`);
    return wallet;
}

module.exports = { getSigner };
