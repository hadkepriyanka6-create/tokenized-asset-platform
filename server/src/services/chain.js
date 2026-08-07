const { ethers } = require("ethers");
const { getProvider } = require("../config/blockchain");
const { getSigner } = require("../config/wallet");
const { address, getReadContract, getWriteContract } = require("../config/contract");

/* -------------------------------------------------------------------------- */
/*                          REVERTS IN PLAIN LANGUAGE                         */
/* -------------------------------------------------------------------------- */

// CommodityToken reverts with custom errors. Ethers decodes them against the
// ABI; this turns the decoded name into something a holder can act on, which
// is what the interface shows instead of a raw selector.

const REVERTS = {
    AddressNotWhiteListed: () => "This address isn't approved to receive tokens.",
    TransferNotAllowed: () =>
        "Aurum only allows transfers between approved addresses, so the contract rejected this one.",
    StaleOraclePrice: () =>
        "The gold price hasn't updated recently. Trading is paused until it does.",
    InvalidOracleAnswer: () => "The price feed returned an invalid answer. Trading is unavailable.",
    EnforcedPause: () => "Aurum is paused. Transfers and trading are unavailable.",
    InsufficientTokensInContract: (args) =>
        `Only ${args?.[1] ?? "0"} tokens are available in this batch.`,
    ExceedsBatchSupply: (args) =>
        `Only ${args?.[1] ?? "0"} tokens remain before this batch reaches its cap.`,
    BurnExceedsMintedSupply: (args) =>
        `Only ${args?.[1] ?? "0"} tokens have been minted in this batch.`,
    InsufficientPayment: (args) =>
        `Not enough ETH was sent. The contract required ${ethers.formatEther(args?.[0] ?? 0)} ETH.`,
    InsufficientContractBalance: () =>
        "The contract doesn't hold enough ETH to settle this. Top up the reserve and try again.",
    PayoutBelowMinimum: (args) =>
        `The price moved and the payout fell to ${ethers.formatEther(
            args?.[0] ?? 0
        )} ETH, below your minimum. Nothing was sold.`,
    BatchDoesNotExist: (args) => `Batch ${args?.[0] ?? ""} does not exist.`,
    AlreadyWhitelisted: () => "That address is already approved.",
    WhiteListBatchLimitExceeded: (args) =>
        `At most ${args?.[1] ?? 10} addresses can be approved in one transaction.`,
    EmptyWhiteListBatch: () => "No addresses were supplied.",
    CannotRemoveContractSelf: () => "Aurum's own contract address cannot be removed from the whitelist.",
    FeeTooHigh: (args) => `The fee is capped at ${args?.[1] ?? 1000} basis points.`,
    GramsPerTokenTooLarge: (args) => `Grams per token is capped at ${args?.[1] ?? ""}.`,
    MaxSupplyMustBeGreaterThanZero: () => "Maximum supply must be greater than zero.",
    GramsPerTokenMustBeGreaterThanZero: () => "Grams per token must be greater than zero.",
    AmountMustBeGreaterThanZero: () => "Amount must be greater than zero.",
    ZeroPriceFeedAddress: () => "A Chainlink price feed address is required.",
    EmptyAssetSymbol: () => "An asset symbol is required.",
    EmptyCustodyReference: () => "A custody reference is required.",
    ZeroAddress: () => "That address cannot be the zero address.",
    AccessControlUnauthorizedAccount: () =>
        "The operator wallet doesn't hold the on-chain role this action requires.",
};

function describeRevert(error) {
    const name = error?.revert?.name;
    const args = error?.revert?.args;

    if (name && REVERTS[name]) {
        return { code: name, message: REVERTS[name](args) };
    }
    if (name) {
        return { code: name, message: `The contract rejected this: ${name}.` };
    }
    if (error?.code === "INSUFFICIENT_FUNDS") {
        return {
            code: "INSUFFICIENT_FUNDS",
            message: "The operator wallet doesn't have enough Sepolia ETH to pay for gas.",
        };
    }
    return {
        code: error?.code || "UNKNOWN",
        message: error?.shortMessage || error?.message || "The transaction failed.",
    };
}

/* -------------------------------------------------------------------------- */
/*                                  GUARDS                                    */
/* -------------------------------------------------------------------------- */

class ChainUnavailable extends Error {
    constructor(message) {
        super(message);
        this.name = "ChainUnavailable";
        this.status = 503;
    }
}

function reader() {
    const contract = getReadContract();
    if (!contract) {
        throw new ChainUnavailable(
            "Chain is not configured. Set SEPOLIA_RPC_URL and CONTRACT_ADDRESS in server/.env"
        );
    }
    return contract;
}

function writer() {
    const contract = getWriteContract();
    if (!contract) {
        throw new ChainUnavailable(
            "Operator wallet is not configured. Set PRIVATE_KEY in server/.env"
        );
    }
    return contract;
}

const isConfigured = () => Boolean(getReadContract());

/* -------------------------------------------------------------------------- */
/*                                   READS                                    */
/* -------------------------------------------------------------------------- */

const ROLE_NAMES = ["DEFAULT_ADMIN_ROLE", "COMPLIANCE_ROLE", "ISSUER_ROLE", "PAUSER_ROLE"];

const AGGREGATOR_ABI = [
    "function description() view returns (string)",
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

/** Reads a Chainlink feed directly so the UI can show its age and staleness. */
async function readFeed(feedAddress) {
    const provider = getProvider();
    if (!provider || !feedAddress || feedAddress === ethers.ZeroAddress) return null;

    try {
        const feed = new ethers.Contract(feedAddress, AGGREGATOR_ABI, provider);
        const [description, decimals, round] = await Promise.all([
            feed.description(),
            feed.decimals(),
            feed.latestRoundData(),
        ]);
        const updatedAt = Number(round[3]);
        const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - updatedAt);

        return {
            address: feedAddress,
            description,
            decimals: Number(decimals),
            answer: round[1].toString(),
            price: Number(round[1]) / 10 ** Number(decimals),
            updatedAt,
            ageSeconds,
            // The contract refuses to trade on a price older than MAX_PRICE_AGE.
            stale: ageSeconds > 3 * 60 * 60,
        };
    } catch {
        return { address: feedAddress, description: null, price: null, stale: true };
    }
}

async function status() {
    const contract = reader();
    const provider = getProvider();
    const signer = getSigner();

    const [network, paused, royaltyFeeBps, treasury, nextBatchId, reserve, ethUsdFeed] =
        await Promise.all([
            provider.getNetwork(),
            contract.paused(),
            contract.royaltyFeeBps(),
            contract.treasury(),
            contract.nextBatchId(),
            provider.getBalance(address()),
            contract.ethUsdFeed(),
        ]);

    const ethUsd = await readFeed(ethUsdFeed);

    return {
        configured: true,
        chainId: Number(network.chainId),
        contract: address(),
        operator: signer ? signer.address : null,
        paused,
        royaltyFeeBps: Number(royaltyFeeBps),
        maxFeeBps: 1000,
        treasury,
        nextBatchId: Number(nextBatchId),
        reserveWei: reserve.toString(),
        ethUsd,
    };
}

/** One batch, merged from the struct, live inventory and the live quote. */
async function getBatch(id) {
    const contract = reader();
    const details = await contract.getBatchDetails(id);

    const gramsPerToken = Number(details[2]);
    const inventory = await contract.balanceOf(address(), id);

    let priceWei = null;
    let priceError = null;
    try {
        priceWei = (await contract.tokenPriceInWei(id)).toString();
    } catch (error) {
        priceError = describeRevert(error).message;
    }

    const feed = await readFeed(details[4]);

    return {
        batchId: Number(id),
        maxSupply: Number(details[0]),
        mintedSupply: Number(details[1]),
        gramsPerToken,
        assetSymbol: details[3],
        priceFeedAddress: details[4],
        custodyReference: details[5],
        exists: details[6],
        inventory: Number(inventory),
        circulating: Number(details[1]) - Number(inventory),
        headroom: Number(details[0]) - Number(details[1]),
        priceWei,
        priceError,
        feed,
    };
}

async function listBatches() {
    const contract = reader();
    const next = Number(await contract.nextBatchId());

    const ids = [];
    for (let id = 1; id < next; id += 1) ids.push(id);

    const batches = await Promise.all(
        ids.map((id) => getBatch(id).catch(() => null))
    );
    return batches.filter(Boolean);
}

/** Every batch balance held by one address, with the gold weight it represents. */
async function balancesOf(holder) {
    const contract = reader();
    const batches = await listBatches();

    const balances = await Promise.all(
        batches.map(async (batch) => {
            const raw = await contract.balanceOf(holder, batch.batchId);
            const quantity = Number(raw);
            return {
                batchId: batch.batchId,
                quantity,
                grams: quantity * batch.gramsPerToken,
                valueWei:
                    batch.priceWei !== null
                        ? (BigInt(batch.priceWei) * BigInt(quantity)).toString()
                        : null,
                batch,
            };
        })
    );

    return balances.filter((entry) => entry.quantity > 0);
}

async function isWhitelisted(account) {
    return reader().isWhitelisted(account);
}

async function balanceOf(account, batchId) {
    return Number(await reader().balanceOf(account, batchId));
}

/** Which addresses hold which on-chain roles, read live. */
async function roles() {
    const contract = reader();
    const signer = getSigner();

    return Promise.all(
        ROLE_NAMES.map(async (name) => {
            const hash = await contract[name]();
            return {
                name,
                hash,
                operatorHolds: signer ? await contract.hasRole(hash, signer.address) : false,
            };
        })
    );
}

async function hasRole(roleName, account) {
    const contract = reader();
    if (!ROLE_NAMES.includes(roleName)) throw new Error(`Unknown role: ${roleName}`);
    return contract.hasRole(await contract[roleName](), account);
}

/* -------------------------------------------------------------------------- */
/*                                   WRITES                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sends an operator transaction and waits for it. Every write route funnels
 * through here so a revert always comes back as a readable message with the
 * custom-error name attached rather than an ethers stack trace.
 */
async function send(label, execute) {
    try {
        const tx = await execute(writer());
        console.log(`[Chain] ⏳ ${label} sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`[Chain] ✅ ${label} confirmed in block ${receipt.blockNumber}`);
        return { txHash: tx.hash, blockNumber: receipt.blockNumber, receipt };
    } catch (error) {
        const described = describeRevert(error);
        console.error(`[Chain] ❌ ${label} failed: ${described.code} — ${described.message}`);
        const wrapped = new Error(described.message);
        wrapped.code = described.code;
        wrapped.status = 400;
        throw wrapped;
    }
}

/** Pulls a decoded event out of a receipt by name. */
function eventFrom(receipt, name) {
    const contract = getReadContract();
    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog(log);
            if (parsed && parsed.name === name) return parsed;
        } catch {
            /* not one of ours */
        }
    }
    return null;
}

const writes = {
    createBatch: (maxSupply, gramsPerToken, assetSymbol, priceFeedAddress, custodyReference) =>
        send("createBatch", (c) =>
            c.createBatch(maxSupply, gramsPerToken, assetSymbol, priceFeedAddress, custodyReference)
        ),

    mint: (id, amount) => send("mint", (c) => c.mint(id, amount)),
    burn: (id, amount) => send("burn", (c) => c.burn(id, amount)),

    updateCustodyReference: (id, reference) =>
        send("updateCustodyReference", (c) => c.updateCustodyReference(id, reference)),
    updatePriceFeed: (id, feed) => send("updatePriceFeed", (c) => c.updatePriceFeed(id, feed)),

    addToWhitelist: (account) => send("addToWhitelist", (c) => c.addToWhitelist(account)),
    addBatchToWhitelist: (accounts) =>
        send("addBatchToWhitelist", (c) => c.addBatchToWhitelist(accounts)),
    removeFromWhitelist: (account) =>
        send("removeFromWhitelist", (c) => c.removeFromWhitelist(account)),

    setRoyaltyFee: (bps) => send("setRoyaltyFee", (c) => c.setRoyaltyFee(bps)),
    setTreasury: (account) => send("setTreasury", (c) => c.setTreasury(account)),
    withdrawExcess: (keepWei) => send("withdrawExcess", (c) => c.withdrawExcess(keepWei)),

    pause: () => send("pause", (c) => c.pause()),
    unpause: () => send("unpause", (c) => c.unpause()),

    grantRole: async (roleName, account) => {
        const hash = await reader()[roleName]();
        return send("grantRole", (c) => c.grantRole(hash, account));
    },
    revokeRole: async (roleName, account) => {
        const hash = await reader()[roleName]();
        return send("revokeRole", (c) => c.revokeRole(hash, account));
    },
};

/* -------------------------------------------------------------------------- */
/*                          RECEIPT VERIFICATION                              */
/* -------------------------------------------------------------------------- */

/**
 * Reads a transaction the *investor* signed in their own wallet and pulls the
 * contract event out of it. The API records history from what the chain says
 * happened, never from what the client claims — otherwise anyone could POST a
 * fake purchase.
 */
async function verifyReceipt(txHash, eventName) {
    const provider = getProvider();
    if (!provider) throw new ChainUnavailable("Chain is not configured.");

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
        const error = new Error("That transaction hasn't been mined yet.");
        error.status = 409;
        throw error;
    }
    if (receipt.status !== 1) {
        const error = new Error("That transaction reverted on-chain.");
        error.status = 400;
        throw error;
    }
    if (receipt.to?.toLowerCase() !== address().toLowerCase()) {
        const error = new Error("That transaction was not sent to the Aurum contract.");
        error.status = 400;
        throw error;
    }

    const event = eventFrom(receipt, eventName);
    if (!event) {
        const error = new Error(`That transaction contains no ${eventName} event.`);
        error.status = 400;
        throw error;
    }

    return { receipt, event };
}

module.exports = {
    ChainUnavailable,
    isConfigured,
    describeRevert,
    readFeed,
    status,
    getBatch,
    listBatches,
    balancesOf,
    balanceOf,
    isWhitelisted,
    roles,
    hasRole,
    eventFrom,
    verifyReceipt,
    ROLE_NAMES,
    ...writes,
};
