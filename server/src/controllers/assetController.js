const Asset = require("../models/asset");
const chain = require("../services/chain");
const asyncHandler = require("../middleware/asyncHandler");

const bad = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

/**
 * Issuer operations. The server wallet holds ISSUER_ROLE, so batch creation,
 * minting and burning are signed here rather than in the browser — an
 * investor's wallet has no authority to call them.
 */

// POST /api/assets/create
exports.createAsset = asyncHandler(async (req, res) => {
    const {
        maxSupply,
        gramsPerToken,
        assetSymbol,
        priceFeedAddress,
        custodyReference,
        name,
        description,
    } = req.body || {};

    if (!Number.isInteger(Number(maxSupply)) || Number(maxSupply) <= 0) {
        throw bad("maxSupply must be a positive whole number.");
    }
    if (!Number.isInteger(Number(gramsPerToken)) || Number(gramsPerToken) <= 0) {
        throw bad("gramsPerToken must be a positive whole number.");
    }
    if (!assetSymbol) throw bad("assetSymbol is required.");
    if (!/^0x[a-fA-F0-9]{40}$/.test(priceFeedAddress || "")) {
        throw bad("priceFeedAddress must be a valid contract address.");
    }
    if (!custodyReference) throw bad("custodyReference is required.");

    const { txHash, receipt } = await chain.createBatch(
        Number(maxSupply),
        Number(gramsPerToken),
        assetSymbol,
        priceFeedAddress,
        custodyReference
    );

    const event = chain.eventFrom(receipt, "BatchCreated");
    const batchId = event ? Number(event.args.id) : null;

    // Written only after the chain confirms, so the registry can never hold a
    // batch the contract doesn't have.
    const asset = await Asset.create({
        batchId,
        maxSupply: Number(maxSupply),
        gramsPerToken: Number(gramsPerToken),
        assetSymbol,
        priceFeedAddress,
        custodyReference,
        name: name || custodyReference,
        description,
        owner: req.user.id,
        txHash,
        status: "confirmed",
    });

    res.status(201).json({
        message: `Batch ${batchId} created on-chain.`,
        batchId,
        txHash,
        asset,
    });
});

// POST /api/assets/:batchId/mint
exports.mintBatch = asyncHandler(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
        throw bad("amount must be a positive whole number.");
    }

    const batchId = Number(req.params.batchId);
    const { txHash } = await chain.mint(batchId, amount);

    await Asset.findOneAndUpdate(
        { batchId },
        { $inc: { mintedSupply: amount } }
    );

    res.json({ message: `Minted ${amount} tokens into batch ${batchId}.`, txHash });
});

// POST /api/assets/:batchId/burn
exports.burnBatch = asyncHandler(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
        throw bad("amount must be a positive whole number.");
    }

    const batchId = Number(req.params.batchId);
    const { txHash } = await chain.burn(batchId, amount);

    await Asset.findOneAndUpdate(
        { batchId },
        { $inc: { mintedSupply: -amount } }
    );

    res.json({ message: `Burned ${amount} tokens from batch ${batchId}.`, txHash });
});

// PATCH /api/assets/:batchId/custody
exports.updateCustody = asyncHandler(async (req, res) => {
    const reference = (req.body?.custodyReference || "").trim();
    if (!reference) throw bad("custodyReference is required.");

    const batchId = Number(req.params.batchId);
    const { txHash } = await chain.updateCustodyReference(batchId, reference);

    await Asset.findOneAndUpdate({ batchId }, { custodyReference: reference });

    res.json({ message: "Custody reference updated.", txHash });
});

// PATCH /api/assets/:batchId/feed
exports.updateFeed = asyncHandler(async (req, res) => {
    const feed = req.body?.priceFeedAddress;
    if (!/^0x[a-fA-F0-9]{40}$/.test(feed || "")) {
        throw bad("priceFeedAddress must be a valid contract address.");
    }

    const batchId = Number(req.params.batchId);
    const { txHash } = await chain.updatePriceFeed(batchId, feed);

    await Asset.findOneAndUpdate({ batchId }, { priceFeedAddress: feed });

    res.json({ message: "Price feed updated.", txHash });
});

/* ------------------------------ registry reads ----------------------------- */

// GET /api/assets
exports.getAssets = asyncHandler(async (req, res) => {
    res.json(await Asset.find().populate("owner", "fullName email").sort({ batchId: 1 }));
});

// GET /api/assets/:id
exports.getAssetById = asyncHandler(async (req, res) => {
    const asset = await Asset.findById(req.params.id).populate("owner", "fullName email");
    if (!asset) throw bad("Asset not found.", 404);
    res.json(asset);
});

// GET /api/assets/batch/:batchId
exports.getAssetByBatchId = asyncHandler(async (req, res) => {
    const asset = await Asset.findOne({ batchId: req.params.batchId }).populate(
        "owner",
        "fullName email"
    );
    if (!asset) throw bad("Batch not found.", 404);
    res.json(asset);
});
