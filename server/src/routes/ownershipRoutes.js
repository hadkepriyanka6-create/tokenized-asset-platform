const router = require("express").Router();

const auth = require("../middleware/authMiddleware");
const { getMyOwnership } = require("../controllers/ownershipController");

// Ownership is derived from on-chain balances on every read — see the
// controller for why it is no longer stored.
router.get("/my", auth, getMyOwnership);

module.exports = router;
