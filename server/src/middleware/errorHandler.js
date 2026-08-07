// Single place that turns a thrown error into a response. Chain errors carry
// a `status` and a plain-language `message` set by services/chain.js, so a
// contract revert reaches the client already translated.

const DB_ERRORS = ["MongooseError", "MongoNotConnectedError", "MongoServerSelectionError"];

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
    // A buffering timeout means Mongo never connected — say so plainly rather
    // than surfacing "Operation buffering timed out after 5000ms".
    if (DB_ERRORS.includes(error.name) || /buffering timed out/i.test(error.message || "")) {
        console.error(`[API] ❌ ${req.method} ${req.originalUrl} — database unavailable`);
        return res.status(503).json({
            success: false,
            message: "The database is unavailable. Check MONGO_URI and that MongoDB is running.",
            code: "DB_UNAVAILABLE",
        });
    }

    if (error.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: Object.values(error.errors)
                .map((e) => e.message)
                .join(" "),
            code: "VALIDATION",
        });
    }

    const status = error.status || 500;

    if (status >= 500) {
        console.error(`[API] ❌ ${req.method} ${req.originalUrl}`, error);
    } else {
        console.warn(`[API] ⚠️  ${req.method} ${req.originalUrl} — ${error.message}`);
    }

    res.status(status).json({
        success: false,
        message: error.message || "Something went wrong.",
        code: error.code,
    });
}

function notFound(req, res) {
    res.status(404).json({
        success: false,
        message: `No route for ${req.method} ${req.originalUrl}`,
    });
}

module.exports = { errorHandler, notFound };
