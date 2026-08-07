const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        // ── Identity ───────────────────────────────────────────────────
        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
        },

        // ── Blockchain ─────────────────────────────────────────────────
        // The Ethereum wallet this user signs transactions with.
        // Must match the address whitelisted on the contract.
        walletAddress: {
            type: String,
            unique: true,
            sparse: true,           // optional until user connects a wallet
            lowercase: true,        // always store checksummed lower form
            trim: true,
        },

        // Whether this wallet has been whitelisted on-chain by compliance
        isWhitelisted: {
            type: Boolean,
            default: false,
        },

        // ── Role ───────────────────────────────────────────────────────
        // Mirrors the on-chain access control roles:
        //   Investor       → can purchase / sell tokens (needs whitelist)
        //   Issuer         → can createBatch / updateBatch (ISSUER_ROLE)
        //   Compliance     → can whitelist wallets (COMPLIANCE_ROLE)
        //   Admin          → full access (DEFAULT_ADMIN_ROLE)
        role: {
            type: String,
            enum: ["Investor", "Issuer", "Compliance", "Admin"],
            default: "Investor",
        },

        // ── KYC / Verification ─────────────────────────────────────────
        isVerified: {
            type: Boolean,
            default: false,         // must pass KYC before whitelisting
        },

        // When the holder asked compliance to approve their wallet. Drives
        // the "Approval requested" state in the interface.
        approvalRequestedAt: {
            type: Date,
            default: null,
        },

        // Set once compliance confirms the on-chain addToWhitelist landed.
        whitelistedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,           // createdAt + updatedAt
    }
);

module.exports = mongoose.model("User", userSchema);