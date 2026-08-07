const router = require("express").Router();

const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

const {
    register,
    login,
    getMe,
    setWallet,
    requestApproval,
    listUsers,
} = require("../controllers/userController");

router.post("/register", register);
router.post("/login", login);

router.get("/me", auth, getMe);
router.patch("/wallet", auth, setWallet);
router.post("/request-approval", auth, requestApproval);

router.get("/", auth, role("Compliance", "Admin"), listUsers);

module.exports = router;
