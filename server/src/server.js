require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const chain = require("./services/chain");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();

// The Vite dev server and any deployed origin listed in CORS_ORIGIN.
const origins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5199")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({ origin: origins, credentials: true }));
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        chainConfigured: chain.isConfigured(),
        uptimeSeconds: Math.round(process.uptime()),
    });
});

app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/assets", require("./routes/assetRoutes"));
app.use("/api/chain", require("./routes/chainRoutes"));
app.use("/api/compliance", require("./routes/complianceRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/investments", require("./routes/investmentRoutes"));
app.use("/api/ownership", require("./routes/ownershipRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// The database connects in the background. A Mongo outage should not stop the
// chain-backed reads from serving, so the listener starts either way.
connectDB().catch(() => {});

app.listen(PORT, () => {
    console.log(`[API] 🚀 Aurum API listening on http://localhost:${PORT}`);
    console.log(`[API] 🌐 CORS origins: ${origins.join(", ")}`);
    if (!chain.isConfigured()) {
        console.warn("[API] ⚠️  Chain is not configured — /api/chain routes will return 503.");
    }
});

module.exports = app;
