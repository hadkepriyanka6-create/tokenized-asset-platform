/**
 * End-to-end check of the API surface. Read-only against the chain — it never
 * sends a transaction, so it costs no Sepolia ETH and is safe to re-run.
 *
 *   node scripts/smoke.cjs [baseUrl]
 */

require("dotenv").config({ quiet: true });

const BASE = process.argv[2] || `http://127.0.0.1:${process.env.PORT || 5050}`;

let passed = 0;
const failures = [];

function check(label, condition, detail) {
    if (condition) {
        passed += 1;
        console.log(`ok    ${label}`);
    } else {
        failures.push(label);
        console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    }
}

async function call(method, path, { token, body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        /* empty body */
    }
    return { status: res.status, body: json };
}

(async () => {
    const stamp = Date.now();
    const email = `smoke.${stamp}@aurum.test`;
    const wallet = `0x${stamp.toString(16).padStart(40, "a").slice(-40)}`;

    /* ---------------------------------------------------------------- health */

    const health = await call("GET", "/health");
    check("GET /health", health.status === 200 && health.body.status === "ok");

    /* ----------------------------------------------------------------- chain */

    const status = await call("GET", "/api/chain/status");
    check("GET /api/chain/status", status.status === 200, JSON.stringify(status.body));
    if (status.body?.configured) {
        check("  chain is Sepolia", status.body.chainId === 11155111, `chainId=${status.body.chainId}`);
        check("  contract address returned", /^0x[a-fA-F0-9]{40}$/.test(status.body.contract || ""));
        check("  fee is within the cap", status.body.royaltyFeeBps <= status.body.maxFeeBps);
        check("  ETH/USD feed read", typeof status.body.ethUsd?.price === "number");
    }

    const batches = await call("GET", "/api/chain/batches");
    check("GET /api/chain/batches", batches.status === 200 && Array.isArray(batches.body));

    /* ------------------------------------------------------------------ auth */

    const weak = await call("POST", "/api/users/register", {
        body: { fullName: "Weak Password", email: `weak.${stamp}@aurum.test`, password: "password" },
    });
    check("weak password is rejected", weak.status === 400, JSON.stringify(weak.body));

    const dupeCheck = await call("POST", "/api/users/register", {
        body: { fullName: "Smoke Test", email, password: "Str0ng!Pass" },
    });
    check("POST /api/users/register", dupeCheck.status === 201, JSON.stringify(dupeCheck.body));
    check("  no password hash in the response", !("password" in (dupeCheck.body?.user || {})));
    check("  token issued", typeof dupeCheck.body?.token === "string");

    const dupe = await call("POST", "/api/users/register", {
        body: { fullName: "Smoke Test", email, password: "Str0ng!Pass" },
    });
    check("duplicate email is rejected", dupe.status === 409);

    const login = await call("POST", "/api/users/login", {
        body: { email, password: "Str0ng!Pass" },
    });
    check("POST /api/users/login", login.status === 200 && Boolean(login.body?.token));
    check("  login returns the user", login.body?.user?.email === email);

    const wrongPassword = await call("POST", "/api/users/login", {
        body: { email, password: "Wr0ng!Pass" },
    });
    check("wrong password is rejected", wrongPassword.status === 400);

    const token = login.body.token;

    const noToken = await call("GET", "/api/users/me");
    check("protected route needs a token", noToken.status === 401);

    const badToken = await call("GET", "/api/users/me", { token: "not-a-jwt" });
    check("invalid token is rejected", badToken.status === 401);

    const me = await call("GET", "/api/users/me", { token });
    check("GET /api/users/me", me.status === 200 && me.body.email === email);
    check("  defaults to Investor", me.body.role === "Investor");
    check("  starts unverified", me.body.isVerified === false);

    /* ---------------------------------------------------------------- wallet */

    const badWallet = await call("PATCH", "/api/users/wallet", {
        token,
        body: { walletAddress: "nope" },
    });
    check("malformed wallet is rejected", badWallet.status === 400);

    const setWallet = await call("PATCH", "/api/users/wallet", {
        token,
        body: { walletAddress: wallet },
    });
    check("PATCH /api/users/wallet", setWallet.status === 200, JSON.stringify(setWallet.body));

    const requestApproval = await call("POST", "/api/users/request-approval", { token });
    check("POST /api/users/request-approval", requestApproval.status === 200);
    check(
        "  request timestamp recorded",
        Boolean(requestApproval.body?.user?.approvalRequestedAt)
    );

    /* ------------------------------------------------------- role enforcement */

    const investorCreate = await call("POST", "/api/assets/create", {
        token,
        body: {
            maxSupply: 100,
            gramsPerToken: 1,
            assetSymbol: "XAU",
            priceFeedAddress: "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea",
            custodyReference: "SMOKE-TEST",
        },
    });
    check("investor cannot create a batch", investorCreate.status === 403, `got ${investorCreate.status}`);

    const investorAdmin = await call("GET", "/api/admin/roles", { token });
    check("investor cannot read admin roles", investorAdmin.status === 403);

    const investorCompliance = await call("POST", "/api/compliance/whitelist", {
        token,
        body: { address: wallet },
    });
    check("investor cannot whitelist", investorCompliance.status === 403);

    const investorPause = await call("POST", "/api/admin/pause", { token });
    check("investor cannot pause the contract", investorPause.status === 403);

    /* ------------------------------------------------------------- portfolio */

    const ownership = await call("GET", "/api/ownership/my", { token });
    check("GET /api/ownership/my", ownership.status === 200, JSON.stringify(ownership.body));
    check("  holdings array returned", Array.isArray(ownership.body?.holdings));
    check("  whitelist status resolved", typeof ownership.body?.whitelisted === "boolean");

    const transactions = await call("GET", "/api/transactions/my-transactions", { token });
    check("GET /api/transactions/my-transactions", transactions.status === 200);

    /* -------------------------------------------------- receipt verification */

    const fakeHash = await call("POST", "/api/investments/buy", {
        token,
        body: { txHash: "0xdeadbeef" },
    });
    check("malformed txHash is rejected", fakeHash.status === 400);

    const unknownHash = await call("POST", "/api/investments/buy", {
        token,
        body: { txHash: `0x${"1".repeat(64)}` },
    });
    check(
        "unmined txHash cannot forge history",
        unknownHash.status === 409 || unknownHash.status === 400,
        `got ${unknownHash.status}`
    );

    /* ------------------------------------------------------------- not found */

    const missing = await call("GET", "/api/nope");
    check("unknown route returns 404 JSON", missing.status === 404 && missing.body?.success === false);

    /* ------------------------------------------------------------------ done */

    console.log(
        failures.length
            ? `\n${passed} passed, ${failures.length} FAILED:\n- ${failures.join("\n- ")}`
            : `\nall ${passed} checks passed`
    );
    process.exit(failures.length ? 1 : 0);
})().catch((error) => {
    console.error("FATAL:", error.message);
    process.exit(1);
});
