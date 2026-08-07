const router = require("express").Router();

const auth = require("../middleware/authMiddleware");

const {
    getStatus,
    getBatches,
    getBatchById,
    getHoldings,
    checkWhitelist,
} = require("../controllers/chainController");

// Contract state is public — the custody page and the connect screen read it
// before anyone signs in.
router.get("/status", getStatus);
router.get("/batches", getBatches);
router.get("/batches/:batchId", getBatchById);

router.get("/holdings/:address", auth, getHoldings);
router.get("/whitelist/:address", auth, checkWhitelist);

module.exports = router;
