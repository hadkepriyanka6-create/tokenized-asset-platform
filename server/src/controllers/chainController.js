const chain = require("../services/chain");
const Asset = require("../models/asset");
const asyncHandler = require("../middleware/asyncHandler");

/**
 * Everything under /api/chain reads the deployed contract directly. The
 * database is only used to attach the off-chain description an issuer typed
 * when they created the batch — supply, price and inventory always come from
 * the chain, never from a cached row.
 */

// GET /api/chain/status
exports.getStatus = asyncHandler(async (req, res) => {
    if (!chain.isConfigured()) {
        return res.json({
            configured: false,
            message:
                "Chain is not configured. Set SEPOLIA_RPC_URL and CONTRACT_ADDRESS in server/.env",
        });
    }
    res.json(await chain.status());
});

// GET /api/chain/batches
exports.getBatches = asyncHandler(async (req, res) => {
    const batches = await chain.listBatches();

    const records = await Asset.find({
        batchId: { $in: batches.map((b) => b.batchId) },
    }).lean();

    const byBatchId = new Map(records.map((record) => [record.batchId, record]));

    res.json(
        batches.map((batch) => ({
            ...batch,
            name: byBatchId.get(batch.batchId)?.name || batch.custodyReference,
            description: byBatchId.get(batch.batchId)?.description || null,
            assetId: byBatchId.get(batch.batchId)?._id || null,
        }))
    );
});

// GET /api/chain/batches/:batchId
exports.getBatchById = asyncHandler(async (req, res) => {
    const batch = await chain.getBatch(Number(req.params.batchId));
    const record = await Asset.findOne({ batchId: batch.batchId }).lean();

    res.json({
        ...batch,
        name: record?.name || batch.custodyReference,
        description: record?.description || null,
        assetId: record?._id || null,
    });
});

// GET /api/chain/holdings/:address
exports.getHoldings = asyncHandler(async (req, res) => {
    const holdings = await chain.balancesOf(req.params.address);
    const records = await Asset.find({
        batchId: { $in: holdings.map((h) => h.batchId) },
    }).lean();
    const byBatchId = new Map(records.map((record) => [record.batchId, record]));

    res.json(
        holdings.map((holding) => ({
            ...holding,
            batch: {
                ...holding.batch,
                name: byBatchId.get(holding.batchId)?.name || holding.batch.custodyReference,
            },
        }))
    );
});

// GET /api/chain/whitelist/:address
exports.checkWhitelist = asyncHandler(async (req, res) => {
    res.json({
        address: req.params.address,
        whitelisted: await chain.isWhitelisted(req.params.address),
    });
});
