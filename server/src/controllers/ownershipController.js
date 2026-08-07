const User = require("../models/user");
const Asset = require("../models/asset");
const chain = require("../services/chain");
const asyncHandler = require("../middleware/asyncHandler");

/**
 * Ownership is read from the chain, not stored.
 *
 * The previous implementation saved an `ownershipPercentage` row per purchase,
 * which goes stale the moment anyone buys, sells or transfers — and computed
 * it from `asset.totalTokens`, a field the schema never had. Balances now come
 * from `balanceOf(wallet, batchId)` and the percentage is derived on read.
 */

// GET /api/ownership/my
exports.getMyOwnership = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).lean();

    if (!user?.walletAddress) {
        return res.json({
            walletAddress: null,
            whitelisted: false,
            totalGrams: 0,
            holdings: [],
            message: "Connect a wallet to see your holdings.",
        });
    }

    const [holdings, whitelisted] = await Promise.all([
        chain.balancesOf(user.walletAddress),
        chain.isWhitelisted(user.walletAddress),
    ]);

    const records = await Asset.find({
        batchId: { $in: holdings.map((h) => h.batchId) },
    }).lean();
    const byBatchId = new Map(records.map((record) => [record.batchId, record]));

    res.json({
        walletAddress: user.walletAddress,
        whitelisted,
        totalGrams: holdings.reduce((total, h) => total + h.grams, 0),
        holdings: holdings.map((holding) => ({
            batchId: holding.batchId,
            quantity: holding.quantity,
            grams: holding.grams,
            valueWei: holding.valueWei,
            ownershipPercent:
                holding.batch.maxSupply > 0
                    ? (holding.quantity / holding.batch.maxSupply) * 100
                    : 0,
            name: byBatchId.get(holding.batchId)?.name || holding.batch.custodyReference,
            batch: holding.batch,
        })),
    });
});
