const User = require("../models/user");
const chain = require("../services/chain");
const asyncHandler = require("../middleware/asyncHandler");

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const MAX_BATCH = 10; // MAX_WHITELIST_BATCH_SIZE on the contract

const bad = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

/**
 * The compliance gate. The whitelist itself lives on-chain — the contract
 * rejects any transfer whose sender or recipient is not on it — and the
 * database only records who asked, when, and which account an address belongs
 * to. Every read here checks the chain rather than trusting the mirror.
 */

// GET /api/compliance/whitelist
exports.getRegistry = asyncHandler(async (req, res) => {
    const users = await User.find({ walletAddress: { $ne: null } })
        .select("fullName email walletAddress role isVerified approvalRequestedAt whitelistedAt createdAt")
        .sort({ createdAt: 1 })
        .lean();

    const rows = await Promise.all(
        users.map(async (user) => ({
            ...user,
            onChain: await chain.isWhitelisted(user.walletAddress).catch(() => null),
        }))
    );

    res.json(rows);
});

// POST /api/compliance/whitelist   { address }
exports.approveAddress = asyncHandler(async (req, res) => {
    const address = (req.body?.address || "").trim();
    if (!ADDRESS.test(address)) throw bad("address must be a valid 0x-prefixed address.");

    if (await chain.isWhitelisted(address)) {
        throw bad("That address is already approved.", 409);
    }

    const { txHash } = await chain.addToWhitelist(address);

    await User.findOneAndUpdate(
        { walletAddress: address.toLowerCase() },
        { whitelistedAt: new Date() }
    );

    res.json({ message: `${address} approved to hold tokens.`, txHash });
});

// POST /api/compliance/whitelist/batch   { addresses: [] }
exports.approveBatch = asyncHandler(async (req, res) => {
    const addresses = Array.isArray(req.body?.addresses) ? req.body.addresses : [];

    if (addresses.length === 0) throw bad("Supply at least one address.");
    if (addresses.length > MAX_BATCH) {
        throw bad(`At most ${MAX_BATCH} addresses can be approved in one transaction.`);
    }

    const invalid = addresses.filter((a) => !ADDRESS.test(String(a).trim()));
    if (invalid.length) throw bad(`Not a valid address: ${invalid[0]}`);

    const cleaned = addresses.map((a) => String(a).trim());

    const seen = new Set();
    for (const address of cleaned) {
        const key = address.toLowerCase();
        if (seen.has(key)) throw bad(`${address} appears twice in this list.`);
        seen.add(key);
    }

    // The contract reverts the whole batch if any one address is already on
    // the list, so the offending entry is named before anything is sent.
    for (const address of cleaned) {
        if (await chain.isWhitelisted(address)) {
            throw bad(`${address} is already approved — remove it and resubmit.`, 409);
        }
    }

    const { txHash } = await chain.addBatchToWhitelist(cleaned);

    await User.updateMany(
        { walletAddress: { $in: cleaned.map((a) => a.toLowerCase()) } },
        { whitelistedAt: new Date() }
    );

    res.json({ message: `${cleaned.length} addresses approved.`, txHash });
});

// DELETE /api/compliance/whitelist/:address
exports.removeAddress = asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!ADDRESS.test(address)) throw bad("address must be a valid 0x-prefixed address.");

    const { txHash } = await chain.removeFromWhitelist(address);

    await User.findOneAndUpdate(
        { walletAddress: address.toLowerCase() },
        { whitelistedAt: null }
    );

    res.json({
        message: `${address} can no longer transfer or sell. Its balance is frozen until it is approved again.`,
        txHash,
    });
});

// PATCH /api/compliance/users/:id/verify   { isVerified }
exports.setVerified = asyncHandler(async (req, res) => {
    const isVerified = req.body?.isVerified !== false;

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { isVerified },
        { new: true }
    ).select("fullName email walletAddress role isVerified approvalRequestedAt");

    if (!user) throw bad("User not found.", 404);

    res.json({
        message: isVerified ? "KYC marked as passed." : "KYC verification withdrawn.",
        user,
    });
});
