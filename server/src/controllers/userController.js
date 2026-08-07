const User = require("../models/user");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");
const chain = require("../services/chain");

// At least 8 characters, one uppercase letter, one number, one special character.
const PASSWORD_POLICY = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function toSafeUser(user) {
    return {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        walletAddress: user.walletAddress || null,
        role: user.role,
        isVerified: user.isVerified,
        approvalRequestedAt: user.approvalRequestedAt || null,
        whitelistedAt: user.whitelistedAt || null,
    };
}

const register = async (req, res) => {
    try {

        const { fullName, email, password } = req.body;

        if (!fullName) {
            return res.status(400).json({ error: "fullName is required" });
        }
        if (!email) {
            return res.status(400).json({ error: "email is required" });
        }
        if (!password || !PASSWORD_POLICY.test(password)) {
            return res.status(400).json({
                error:
                    "password must be at least 8 characters and include one uppercase letter, one number, and one special character",
            });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: "an account with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            fullName,
            email,
            password: hashedPassword
        });

        const token = generateToken(user);

        res.status(201).json({
            message: "User registered successfully",
            token,
            user: toSafeUser(user)
        });

    } catch(error) {

        res.status(500).json({
            error: error.message
        });
    }
};


const login = async (req, res) => {
    try {

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" });
        }

        const user = await User.findOne({ email });

        if(!user){
            return res.status(404).json({
                message:"User not found"
            });
        }


        const isMatch = await bcrypt.compare(
            password,
            user.password
        );


        if(!isMatch){
            return res.status(400).json({
                message:"Invalid password"
            });
        }


        const token = generateToken(user);


        res.json({
            message:"Login successful",
            token,
            user: toSafeUser(user)
        });


    } catch(error){

        res.status(500).json({
            error:error.message
        });

    }
};

// Returns the currently authenticated user's profile, with the on-chain
// whitelist status resolved live — the database mirror can lag behind a
// compliance transaction, and the contract is the authority.
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: "user not found" });

        let isWhitelisted = false;
        if (user.walletAddress && chain.isConfigured()) {
            isWhitelisted = await chain.isWhitelisted(user.walletAddress).catch(() => false);
        }

        res.json({ ...toSafeUser(user), isWhitelisted });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Records that this holder has asked compliance to approve their wallet.
// Approval itself is an on-chain action a COMPLIANCE_ROLE holder takes.
const requestApproval = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: "user not found" });
        if (!user.walletAddress) {
            return res.status(400).json({ error: "connect a wallet before requesting approval" });
        }

        user.approvalRequestedAt = user.approvalRequestedAt || new Date();
        await user.save();

        res.json({ message: "Approval requested.", user: toSafeUser(user) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Compliance/Admin only — the account list behind the whitelist screen.
const listUsers = async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: 1 });
        res.json(users.map(toSafeUser));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Links a connected wallet address to the logged-in account.
const setWallet = async (req, res) => {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({ error: "walletAddress must be a valid 0x-prefixed address" });
        }

        // One wallet, one account. On-chain approval is granted to an address,
        // so letting two accounts share one would mean approving a person
        // compliance never reviewed.
        const existing = await User.findOne({ walletAddress });
        if (existing && String(existing._id) !== req.user.id) {
            return res.status(409).json({
                error:
                    "this wallet is already linked to another account — sign in to that account, or connect a different address",
            });
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { walletAddress },
            { new: true }
        );
        if (!user) return res.status(404).json({ error: "user not found" });
        res.json(toSafeUser(user));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


module.exports = {
    register,
    login,
    getMe,
    setWallet,
    requestApproval,
    listUsers
};
