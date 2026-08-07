const jwt = require("jsonwebtoken");

// Generates a signed JWT containing the user's identity and role.
// The decoded payload becomes req.user in authMiddleware.
// Must include role so roleMiddleware can check it without a DB call.

const generateToken = (user) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("[generateToken] JWT_SECRET is not set in environment variables.");
    }

    return jwt.sign(
        {
            id:             user._id,           // MongoDB _id
            role:           user.role,           // "Investor" | "Issuer" | "Compliance" | "Admin"
            isVerified:     user.isVerified,     // KYC status
            isWhitelisted:  user.isWhitelisted,  // on-chain whitelist status
            walletAddress:  user.walletAddress,  // Ethereum wallet (may be null)
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        }
    );
};

module.exports = generateToken;