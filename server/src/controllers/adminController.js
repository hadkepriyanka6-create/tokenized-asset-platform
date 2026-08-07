const { ethers } = require("ethers");
const chain = require("../services/chain");
const asyncHandler = require("../middleware/asyncHandler");

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

const bad = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

/**
 * Contract administration: fee, treasury, reserve, pause and roles. All of it
 * is DEFAULT_ADMIN_ROLE or PAUSER_ROLE work, held by the server wallet.
 */

// PATCH /api/admin/fee   { bps }
exports.setFee = asyncHandler(async (req, res) => {
    const bps = Number(req.body?.bps);
    if (!Number.isInteger(bps) || bps < 0) throw bad("bps must be a whole number of basis points.");
    if (bps > 1000) throw bad("The contract caps the fee at 1000 bps (10%).");

    const { txHash } = await chain.setRoyaltyFee(bps);
    res.json({ message: `Fee set to ${(bps / 100).toFixed(2)}%.`, txHash });
});

// PATCH /api/admin/treasury   { address }
exports.setTreasury = asyncHandler(async (req, res) => {
    const address = (req.body?.address || "").trim();
    if (!ADDRESS.test(address)) throw bad("address must be a valid 0x-prefixed address.");

    const { txHash } = await chain.setTreasury(address);
    res.json({ message: "Treasury updated.", txHash });
});

// POST /api/admin/withdraw   { keepEth }
exports.withdraw = asyncHandler(async (req, res) => {
    const keepEth = String(req.body?.keepEth ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(keepEth)) throw bad("keepEth must be a number, e.g. \"1.5\".");

    const keepWei = ethers.parseEther(keepEth);
    const { txHash } = await chain.withdrawExcess(keepWei);

    res.json({
        message: `Everything above ${keepEth} ETH was sent to the treasury.`,
        txHash,
    });
});

// POST /api/admin/pause
exports.pause = asyncHandler(async (req, res) => {
    const { txHash } = await chain.pause();
    res.json({
        message: "Aurum is paused. Minting, trading and transfers are stopped.",
        txHash,
    });
});

// POST /api/admin/unpause
exports.unpause = asyncHandler(async (req, res) => {
    const { txHash } = await chain.unpause();
    res.json({ message: "Aurum is live again.", txHash });
});

// GET /api/admin/roles
exports.getRoles = asyncHandler(async (req, res) => {
    res.json(await chain.roles());
});

// POST /api/admin/roles/grant   { role, address }
exports.grantRole = asyncHandler(async (req, res) => {
    const { role, address } = req.body || {};
    if (!chain.ROLE_NAMES.includes(role)) {
        throw bad(`role must be one of: ${chain.ROLE_NAMES.join(", ")}`);
    }
    if (!ADDRESS.test((address || "").trim())) {
        throw bad("address must be a valid 0x-prefixed address.");
    }

    const { txHash } = await chain.grantRole(role, address.trim());
    res.json({ message: `${role} granted to ${address}.`, txHash });
});

// POST /api/admin/roles/revoke   { role, address }
exports.revokeRole = asyncHandler(async (req, res) => {
    const { role, address } = req.body || {};
    if (!chain.ROLE_NAMES.includes(role)) {
        throw bad(`role must be one of: ${chain.ROLE_NAMES.join(", ")}`);
    }
    if (!ADDRESS.test((address || "").trim())) {
        throw bad("address must be a valid 0x-prefixed address.");
    }

    const { txHash } = await chain.revokeRole(role, address.trim());
    res.json({ message: `${role} revoked from ${address}.`, txHash });
});
