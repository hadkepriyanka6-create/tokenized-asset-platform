const mongoose = require("mongoose");

// Connecting is not fatal. If Mongo is down the chain reads still work and
// database-backed routes answer 503 with a clear reason, which is far easier
// to diagnose than a process that exits on boot.

mongoose.set("bufferTimeoutMS", 5000);

const isConnected = () => mongoose.connection.readyState === 1;

const connectDB = async () => {
    const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tokenizedAsset";

    console.log(`[DB] 🔌 Connecting to ${mongoURI.replace(/:\/\/[^@]*@/, "://<credentials>@")}`);

    try {
        await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
        console.log(`[DB] ✅ Connected. Database: ${mongoose.connection.name}`);
    } catch (error) {
        console.error(`[DB] ❌ Connection failed: ${error.message}`);
        console.error("[DB] The API will run, but anything touching the database will 503.");
    }

    mongoose.connection.on("disconnected", () => console.warn("[DB] ⚠️  Disconnected."));
    mongoose.connection.on("reconnected", () => console.log("[DB] ✅ Reconnected."));
};

module.exports = connectDB;
module.exports.isConnected = isConnected;
