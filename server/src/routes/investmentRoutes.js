const router = require("express").Router();

const auth = require("../middleware/authMiddleware");

const {
    createInvestment,
    sellInvestment,
} = require("../controllers/investmentController");

// The investor signs the on-chain purchase/sale themselves and posts the hash
// here; the server reads the receipt and records what actually happened.
router.post("/buy", auth, createInvestment);
router.post("/sell", auth, sellInvestment);

module.exports = router;
