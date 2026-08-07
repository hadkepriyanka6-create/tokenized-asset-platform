const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// Transaction — off-chain audit log of every on-chain event.
//
// Maps to these contract events:
//   BatchPurchased(id, buyer, amount, costWei, feeWei)
//   BatchSold(id, seller, amount, payoutWei, feeWei)
//   BatchBurned(id, from, amount)
//
// This is the SINGLE source of truth for purchase/sell history.
// For live token balances, always call contract.balanceOf(wallet, batchId).
// ─────────────────────────────────────────────────────────────────────────────

const transactionSchema = new mongoose.Schema(
    {
        // ── Parties ────────────────────────────────────────────────────
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        asset: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Asset",
            required: true,
            index: true,
        },

        // ── On-chain reference ─────────────────────────────────────────
        batchId: {
            type: Number,           // uint256 id — direct link to on-chain batch
            required: true,
            index: true,
        },

        // ── Event type — which contract event fired ────────────────────
        // BUY   → BatchPurchased event
        // SELL  → BatchSold event
        // BURN  → BatchBurned event
        type: {
            type: String,
            enum: ["BUY", "SELL", "BURN"],
            required: true,
        },

        // ── Token amount ───────────────────────────────────────────────
        tokenAmount: {
            type: Number,           // uint256 amount from contract event
            required: true,
            min: 1,
        },

        // ── Payment — stored as String to avoid JS BigInt overflow ─────
        // BUY:  costWei   = ETH paid by buyer  (from BatchPurchased.costWei)
        // SELL: costWei   = ETH received by seller (from BatchSold.payoutWei)
        // BURN: costWei   = "0" (no payment on burn)
        valueWei: {
            type: String,
            required: true,
            default: "0",
        },

        // Platform/royalty fee charged by the contract
        feeWei: {
            type: String,           // from BatchPurchased.feeWei or BatchSold.feeWei
            default: "0",
        },

        // ── Blockchain proof ───────────────────────────────────────────
        txHash: {
            type: String,
            required: true,
            unique: true,           // one transaction hash = one record
        },

        // ── Status ─────────────────────────────────────────────────────
        status: {
            type: String,
            enum: ["pending", "confirmed", "failed"],
            default: "pending",
            index: true,
        },
    },
    {
        timestamps: true,           // createdAt = when recorded, updatedAt = when confirmed
    }
);

// Fast lookup: all transactions by a user for a specific batch
transactionSchema.index({ user: 1, batchId: 1 });

// Fast lookup: all transactions of a specific type for a batch
transactionSchema.index({ batchId: 1, type: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);