const { ethers } = require("ethers");
const { getProvider } = require("./blockchain");
const { getSigner } = require("./wallet");
const contractABI = require("./contractABI.json");

// Two handles on the same deployment:
//   getReadContract()  — provider-backed, used for every view call.
//   getWriteContract() — signer-backed, used for operator-only transactions.

let readContract = null;
let writeContract = null;

function address() {
    return process.env.CONTRACT_ADDRESS || null;
}

function getReadContract() {
    if (readContract) return readContract;

    const provider = getProvider();
    if (!provider) return null;

    if (!address()) {
        console.warn("[Contract] ⚠️  CONTRACT_ADDRESS is not set — chain routes are disabled.");
        return null;
    }

    readContract = new ethers.Contract(address(), contractABI, provider);
    console.log(`[Contract] 📄 Read handle at ${address()}`);
    return readContract;
}

function getWriteContract() {
    if (writeContract) return writeContract;

    const signer = getSigner();
    if (!signer || !address()) return null;

    writeContract = new ethers.Contract(address(), contractABI, signer);
    console.log("[Contract] ✍️  Write handle ready.");
    return writeContract;
}

module.exports = {
    address,
    contractABI,
    getReadContract,
    getWriteContract,
};
