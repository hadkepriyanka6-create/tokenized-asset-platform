const router = require("express").Router();

const auth = require("../middleware/authMiddleware");

const {
    createTransaction,
    getTransactions,
} = require("../controllers/transactionController");

router.post("/create", auth, createTransaction);
router.get("/my-transactions", auth, getTransactions);

module.exports = router;
