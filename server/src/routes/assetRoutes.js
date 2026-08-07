const router = require("express").Router();

const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

const {
    createAsset,
    getAssets,
    getAssetById,
    getAssetByBatchId,
    mintBatch,
    burnBatch,
    updateCustody,
    updateFeed,
} = require("../controllers/assetController");

const issuer = role("Issuer", "Admin");

// ── Reads ──────────────────────────────────────────────────────────────────
router.get("/", auth, getAssets);
router.get("/batch/:batchId", auth, getAssetByBatchId);
router.get("/:id", auth, getAssetById);

// ── Issuer operations — signed by the server wallet (ISSUER_ROLE) ──────────
router.post("/create", auth, issuer, createAsset);
router.post("/:batchId/mint", auth, issuer, mintBatch);
router.post("/:batchId/burn", auth, issuer, burnBatch);
router.patch("/:batchId/custody", auth, issuer, updateCustody);
router.patch("/:batchId/feed", auth, issuer, updateFeed);

module.exports = router;
