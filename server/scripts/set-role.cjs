/**
 * Promote an account to a platform role.
 *
 *   node scripts/set-role.cjs alice@example.com Admin
 *
 * Roles are deliberately not self-service: there is no API route that lets an
 * account raise its own privileges. The role is baked into the JWT, so the
 * user must log in again for the change to take effect.
 */

require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const User = require("../src/models/user");

const ROLES = ["Investor", "Issuer", "Compliance", "Admin"];

(async () => {
    const [email, role] = process.argv.slice(2);

    if (!email || !role) {
        console.error("usage: node scripts/set-role.cjs <email> <role>");
        console.error(`roles: ${ROLES.join(" | ")}`);
        process.exit(1);
    }
    if (!ROLES.includes(role)) {
        console.error(`Unknown role "${role}". Use one of: ${ROLES.join(", ")}`);
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tokenizedAsset");

    const user = await User.findOneAndUpdate(
        { email: email.toLowerCase() },
        { role },
        { new: true }
    );

    if (!user) {
        console.error(`No account with email ${email}`);
        process.exit(1);
    }

    console.log(`✅ ${user.email} is now ${user.role}. Log in again to pick up the new role.`);
    await mongoose.disconnect();
})();
