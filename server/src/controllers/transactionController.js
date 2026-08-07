const Transaction = require("../models/transaction");
const Asset = require("../models/asset");
const chain = require("../services/chain");
const asyncHandler = require("../middleware/asyncHandler");

const bad = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const EVENT_FOR = {
    BUY: "BatchPurchased",
    SELL: "BatchSold",
    BURN: "BatchBurned",
};

/**
 * History is recorded from receipts, never from what the client claims.
 *
 * The investor signs purchase/sell in their own wallet, then posts the hash
 * here; the server pulls the receipt, confirms it went to the Aurum contract,
 * decodes the event and stores the amounts the contract actually emitted. A
 * forged body can't create a record because the numbers are not read from it.
 */
async function record({ userId, type, txHash }) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash || "")) {
        throw bad("txHash must be a 0x-prefixed 32-byte transaction hash.");
    }

    const existing = await Transaction.findOne({ txHash });
    if (existing) return existing;

    const { event } = await chain.verifyReceipt(txHash, EVENT_FOR[type]);

    const batchId = Number(event.args.id);
    const asset = await Asset.findOne({ batchId });
    if (!asset) throw bad(`Batch ${batchId} is not in the registry.`, 404);

    const tokenAmount = Number(event.args.amount);
    const valueWei =
        type === "BUY"
            ? event.args.costWei.toString()
            : type === "SELL"
              ? event.args.payoutWei.toString()
              : "0";
    const feeWei = type === "BURN" ? "0" : event.args.feeWei.toString();

    return Transaction.create({
        user: userId,
        asset: asset._id,
        batchId,
        type,
        tokenAmount,
        valueWei,
        feeWei,
        txHash,
        status: "confirmed",
    });
}

exports.record = record;

// POST /api/transactions/create   { type, txHash }
exports.createTransaction = asyncHandler(async (req, res) => {
    const type = String(req.body?.type || "").toUpperCase();
    if (!EVENT_FOR[type]) throw bad("type must be BUY, SELL or BURN.");

    const transaction = await record({
        userId: req.user.id,
        type,
        txHash: req.body?.txHash,
    });

    res.status(201).json({ message: "Transaction recorded.", transaction });
});

// GET /api/transactions/my-transactions
exports.getTransactions = asyncHandler(async (req, res) => {
    res.json(
        await Transaction.find({ user: req.user.id })
            .populate("asset", "name assetSymbol gramsPerToken custodyReference batchId")
            .sort({ createdAt: -1 })
    );
});
