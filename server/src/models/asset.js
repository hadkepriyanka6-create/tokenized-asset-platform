const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
    {
        // ── On-chain identity ──────────────────────────────────────────
        // Populated after createBatch tx is confirmed on-chain.
        batchId: {
            type: Number,           // uint256 id returned by createBatch event
            unique: true,
            sparse: true,
            index: true,
        },

        // ── createBatch params — mirrors on-chain BatchInfo struct ──────
        maxSupply: {
            type: Number,           // uint256 maxSupply (total tokens that can ever be minted)
            required: true,
        },

        gramsPerToken: {
            type: Number,           // uint256 gramsPerToken (physical gold grams per token)
            required: true,
        },

        assetSymbol: {
            type: String,           // e.g. "XAU" for Gold — matches contract assetSymbol
            required: true,
            trim: true,
            uppercase: true,
        },

        priceFeedAddress: {
            type: String,           // Chainlink AggregatorV3Interface address for this asset
            required: true,
            lowercase: true,
            trim: true,
        },

        custodyReference: {
            type: String,           // physical vault / custody document reference
            required: true,
            trim: true,
        },

        // ── Live state — synced from on-chain events ───────────────────
        mintedSupply: {
            type: Number,           // updated when BatchPurchased / BatchBurned events fire
            default: 0,
        },

        // ── Blockchain tx tracking ─────────────────────────────────────
        txHash: {
            type: String,           // createBatch transaction hash
            default: null,
        },

        status: {
            type: String,
            enum: ["pending", "confirmed", "failed"],
            default: "pending",
            index: true,
        },

        // ── Off-chain metadata ─────────────────────────────────────────
        // The human name for the batch. Not on-chain — the contract only
        // stores the custody reference and the symbol.
        name: {
            type: String,
            trim: true,
        },

        description: {
            type: String,
            trim: true,
        },

        // The Issuer who created this batch (must have ISSUER_ROLE on-chain)
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Asset", assetSchema);