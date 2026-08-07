const router = require("express").Router();

const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

const {
    getRegistry,
    approveAddress,
    approveBatch,
    removeAddress,
    setVerified,
} = require("../controllers/complianceController");

const compliance = role("Compliance", "Admin");

router.get("/whitelist", auth, compliance, getRegistry);
router.post("/whitelist", auth, compliance, approveAddress);
router.post("/whitelist/batch", auth, compliance, approveBatch);
router.delete("/whitelist/:address", auth, compliance, removeAddress);

router.patch("/users/:id/verify", auth, compliance, setVerified);

module.exports = router;
