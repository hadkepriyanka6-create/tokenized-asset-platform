/**
 * Brings the deployed contract into a state the app can demo against.
 *
 *   node scripts/setup-chain.cjs            # dry run — simulates, sends nothing
 *   node scripts/setup-chain.cjs --send     # actually sends the transactions
 *   node scripts/setup-chain.cjs --send --roles-only
 *
 * Steps, each skipped if already satisfied:
 *   1. Grant COMPLIANCE_ROLE / ISSUER_ROLE / PAUSER_ROLE to the server wallet.
 *      The wallet needs DEFAULT_ADMIN_ROLE to do this — it is the role admin
 *      for every other role.
 *   2. Whitelist the server wallet so it can hold tokens.
 *   3. Create the seed batches and mint inventory into the contract.
 *
 * The dry run uses staticCall, so every step is checked against real contract
 * state without spending gas.
 */

require("dotenv").config({ quiet: true });
const { ethers } = require("ethers");
const abi = require("../src/config/contractABI.json");

const SEND = process.argv.includes("--send");
const ROLES_ONLY = process.argv.includes("--roles-only");

// --fund 0.05  → tops up the contract's ETH reserve so sell() can pay out.
const fundIndex = process.argv.indexOf("--fund");
const FUND_ETH = fundIndex !== -1 ? process.argv[fundIndex + 1] : null;

// Sepolia Chainlink XAU/USD. Verified live: "XAU / USD", 8 decimals.
const XAU_USD_FEED = "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea";

const SEED_BATCHES = [
    {
        maxSupply: 10000,
        gramsPerToken: 1,
        assetSymbol: "XAU",
        custodyReference: "LOOMIS-ZRH-26-0001",
        mint: 2000,
    },
    {
        maxSupply: 10000,
        gramsPerToken: 10,
        assetSymbol: "XAU",
        custodyReference: "LOOMIS-ZRH-26-0117",
        mint: 1200,
    },
    {
        maxSupply: 4000,
        gramsPerToken: 25,
        assetSymbol: "XAU",
        custodyReference: "MALCA-SGP-26-0092",
        mint: 480,
    },
];

const ROLES = ["COMPLIANCE_ROLE", "ISSUER_ROLE", "PAUSER_ROLE"];

const step = (n, text) => console.log(`\n[${n}] ${text}`);

async function run(label, contract, method, args) {
    if (!SEND) {
        try {
            await contract[method].staticCall(...args);
            console.log(`    would send  ${label}  ✓ simulated ok`);
        } catch (error) {
            console.log(
                `    would send  ${label}  ✗ WOULD REVERT: ${
                    error.revert?.name || error.shortMessage || error.message
                }`
            );
        }
        return null;
    }

    const tx = await contract[method](...args);
    process.stdout.write(`    ${label} → ${tx.hash} `);
    const receipt = await tx.wait();
    console.log(`✓ block ${receipt.blockNumber}`);
    return receipt;
}

(async () => {
    for (const key of ["SEPOLIA_RPC_URL", "CONTRACT_ADDRESS", "PRIVATE_KEY"]) {
        if (!process.env[key]) {
            console.error(`${key} is not set in server/.env`);
            process.exit(1);
        }
    }

    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, wallet);

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 11155111) {
        console.error(
            `SEPOLIA_RPC_URL points at chain ${network.chainId}, not Sepolia (11155111).`
        );
        process.exit(1);
    }

    console.log(SEND ? "MODE: sending transactions" : "MODE: dry run (nothing is sent)");
    console.log(`contract : ${process.env.CONTRACT_ADDRESS}`);
    console.log(`operator : ${wallet.address}`);
    console.log(`gas funds: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

    /* ------------------------------------------------------------------ roles */

    step(1, "Roles");
    const adminRole = await contract.DEFAULT_ADMIN_ROLE();
    const isAdmin = await contract.hasRole(adminRole, wallet.address);
    console.log(`    DEFAULT_ADMIN_ROLE: ${isAdmin ? "held" : "NOT HELD"}`);

    if (!isAdmin) {
        console.error(
            "\n    The operator wallet does not hold DEFAULT_ADMIN_ROLE, so it cannot grant\n" +
            "    itself the others. Run grantRole from the deployer wallet first."
        );
        process.exit(1);
    }

    for (const role of ROLES) {
        const hash = await contract[role]();
        if (await contract.hasRole(hash, wallet.address)) {
            console.log(`    ${role}: already held — skipping`);
        } else {
            await run(`grantRole(${role})`, contract, "grantRole", [hash, wallet.address]);
        }
    }

    /* -------------------------------------------------------------- whitelist */

    step(2, "Whitelist");
    if (await contract.isWhitelisted(wallet.address)) {
        console.log("    operator already approved — skipping");
    } else {
        await run("addToWhitelist(operator)", contract, "addToWhitelist", [wallet.address]);
    }

    if (ROLES_ONLY) {
        console.log("\n--roles-only: stopping before batch creation.");
        console.log(SEND ? "Done." : "Dry run complete. Re-run with --send to apply.");
        return;
    }

    /* ---------------------------------------------------------------- batches */

    step(3, "Batches");
    const nextBatchId = Number(await contract.nextBatchId());
    console.log(`    nextBatchId is ${nextBatchId} (${nextBatchId - 1} batch(es) exist)`);

    const existing = new Set();
    for (let id = 1; id < nextBatchId; id += 1) {
        const details = await contract.getBatchDetails(id);
        existing.add(details[5]); // custodyReference
    }

    for (const batch of SEED_BATCHES) {
        if (existing.has(batch.custodyReference)) {
            console.log(`    ${batch.custodyReference}: already on-chain — skipping`);
            continue;
        }

        const receipt = await run(
            `createBatch(${batch.gramsPerToken} g, cap ${batch.maxSupply}, ${batch.custodyReference})`,
            contract,
            "createBatch",
            [
                batch.maxSupply,
                batch.gramsPerToken,
                batch.assetSymbol,
                XAU_USD_FEED,
                batch.custodyReference,
            ]
        );

        if (!receipt) {
            console.log(`                mint(${batch.mint}) — needs the batch to exist first`);
            continue;
        }

        let batchId = null;
        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (parsed?.name === "BatchCreated") batchId = Number(parsed.args.id);
            } catch {
                /* not ours */
            }
        }

        if (batchId !== null) {
            await run(`mint(batch ${batchId}, ${batch.mint})`, contract, "mint", [
                batchId,
                batch.mint,
            ]);
        }
    }

    /* ------------------------------------------------------------- fund reserve */

    if (FUND_ETH) {
        step(4, `Reserve — sending ${FUND_ETH} ETH to the contract`);
        if (!SEND) {
            console.log(`    would send  ${FUND_ETH} ETH → ${process.env.CONTRACT_ADDRESS}`);
        } else {
            // The contract has a payable receive(), so a plain transfer tops
            // up the reserve that sell() pays out from.
            const tx = await wallet.sendTransaction({
                to: process.env.CONTRACT_ADDRESS,
                value: ethers.parseEther(FUND_ETH),
            });
            process.stdout.write(`    transfer → ${tx.hash} `);
            const receipt = await tx.wait();
            console.log(`✓ block ${receipt.blockNumber}`);
        }
    }

    /* ---------------------------------------------------------------- summary */

    step(5, "State");
    const next = Number(await contract.nextBatchId());
    for (let id = 1; id < next; id += 1) {
        const d = await contract.getBatchDetails(id);
        const inventory = await contract.balanceOf(process.env.CONTRACT_ADDRESS, id);
        let price = "unavailable";
        try {
            price = `${ethers.formatEther(await contract.tokenPriceInWei(id))} ETH`;
        } catch (error) {
            price = `unavailable (${error.revert?.name || "revert"})`;
        }
        console.log(
            `    batch ${id}: ${d[2]} g/token · minted ${d[1]}/${d[0]} · inventory ${inventory} · ${price}`
        );
    }

    const reserve = await provider.getBalance(process.env.CONTRACT_ADDRESS);
    console.log(`    reserve: ${ethers.formatEther(reserve)} ETH`);
    if (reserve === 0n) {
        console.log(
            "    ⚠️  The reserve is empty, so sell() will revert with InsufficientContractBalance.\n" +
            "       Send Sepolia ETH to the contract address to fund payouts."
        );
    }

    console.log(SEND ? "\nDone." : "\nDry run complete. Re-run with --send to apply.");
})().catch((error) => {
    console.error("\nFATAL:", error.revert?.name || error.shortMessage || error.message);
    process.exit(1);
});
