const router = require("express").Router();

const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

const {
    setFee,
    setTreasury,
    withdraw,
    pause,
    unpause,
    getRoles,
    grantRole,
    revokeRole,
} = require("../controllers/adminController");

const admin = role("Admin");

router.patch("/fee", auth, admin, setFee);
router.patch("/treasury", auth, admin, setTreasury);
router.post("/withdraw", auth, admin, withdraw);

router.post("/pause", auth, admin, pause);
router.post("/unpause", auth, admin, unpause);

router.get("/roles", auth, admin, getRoles);
router.post("/roles/grant", auth, admin, grantRole);
router.post("/roles/revoke", auth, admin, revokeRole);

module.exports = router;
