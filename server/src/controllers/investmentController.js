const asyncHandler = require("../middleware/asyncHandler");
const { record } = require("./transactionController");

/**
 * Buying and selling happen in the investor's own wallet — `purchase` and
 * `sell` are `onlyWhitelisted(msg.sender)`, so the server key cannot stand in
 * for a holder. These endpoints exist to record what the chain already did.
 *
 * (This replaces the earlier database-only implementation, which wrote an
 * `investor`/`tokens` shape the Transaction model does not have and so failed
 * validation on every call.)
 */

// POST /api/investments/buy   { txHash }
exports.createInvestment = asyncHandler(async (req, res) => {
    const transaction = await record({
        userId: req.user.id,
        type: "BUY",
        txHash: req.body?.txHash,
    });

    res.status(201).json({
        message: `Purchase of ${transaction.tokenAmount} tokens recorded.`,
        transaction,
    });
});

// POST /api/investments/sell   { txHash }
exports.sellInvestment = asyncHandler(async (req, res) => {
    const transaction = await record({
        userId: req.user.id,
        type: "SELL",
        txHash: req.body?.txHash,
    });

    res.status(201).json({
        message: `Sale of ${transaction.tokenAmount} tokens recorded.`,
        transaction,
    });
});
