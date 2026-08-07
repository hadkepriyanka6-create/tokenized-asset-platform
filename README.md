# Aurum — Tokenized Asset & Fractional Ownership

Gold, held in custody and represented on-chain as an ERC-1155 token that can be
split into fractions and transferred **only between KYC-approved holders**. The
compliance gate is enforced in the contract, not the interface — there is no
path around it.

Deployed and live on Ethereum Sepolia:
[`0xeDa6d8F811B1b97d57D9cBaCBFDf515Cba5cc212`](https://sepolia.etherscan.io/address/0xeDa6d8F811B1b97d57D9cBaCBFDf515Cba5cc212)

```
chain/    CommodityToken.sol + Hardhat test suite      (47 tests, all passing)
server/   Express API — auth, registry, operator actions
src/      React + Vite frontend
```

---

## Running it

```bash
npm run setup            # installs all three workspaces

# 1. MongoDB — running on mongodb://127.0.0.1:27017
brew tap mongodb/brew && brew install mongodb-community
brew services start mongodb-community
# (or point MONGO_URI at a free MongoDB Atlas cluster instead)

# 2. Configure the API
cp server/.env.example server/.env      # then fill in RPC, contract, key

# 3. Run
npm run dev:all          # web on :5173, API on :5050
```

See [START.md](START.md) for Windows/Linux instructions and troubleshooting.

Then register an account, connect MetaMask on Sepolia, and ask compliance to
approve your address.

**If the API isn't running the frontend still works** — it falls back to demo
mode using the design's own data, so the interface is always demonstrable. The
badge bottom-right reads `LIVE` or `DEMO`.

### Making yourself an admin

Roles are not self-service; there is no API route that raises your own
privileges. Promote an account from the command line:

```bash
npm --prefix server run set-role -- you@example.com Admin
```

Then log in again — the role is baked into the JWT.

### Preparing the chain

```bash
npm run chain:setup           # dry run — simulates every call, sends nothing
npm run chain:setup:send      # grants roles, whitelists the operator, seeds batches
```

---

## How the pieces fit

**The contract is the source of truth.** Balances, supply, prices, the
whitelist and the roles are read live from Sepolia on every request. The
database stores only what the chain has no room for: accounts, passwords, the
human name of a batch, and an audit log of transactions.

**Two signers, deliberately.**

| Action | Signed by | Why |
| --- | --- | --- |
| Buy, sell, transfer | The holder's MetaMask | `purchase`/`sell` are `onlyWhitelisted(msg.sender)` and transfers check both ends. The server *cannot* move a holder's tokens. |
| Create batch, mint, burn | Server wallet (`ISSUER_ROLE`) | Issuance is a platform action. |
| Whitelist add/remove | Server wallet (`COMPLIANCE_ROLE`) | Compliance decisions are the operator's. |
| Fee, treasury, withdraw, pause | Server wallet (`DEFAULT_ADMIN_ROLE` / `PAUSER_ROLE`) | Contract administration. |

**History can't be forged.** `POST /api/investments/buy` takes a transaction
hash, not an amount. The server fetches the receipt, checks it was sent to the
Aurum contract, decodes the `BatchPurchased` event and records what the
contract actually emitted. A crafted request body creates nothing.

**Pricing is never stored.** The contract derives it live:

```
XAU/USD ÷ 31.1034768 × gramsPerToken ÷ ETH/USD
```

Both legs are Chainlink feeds on Sepolia — XAU/USD at
`0xC5981F46…73B0Ea`, ETH/USD at `0x694AA176…C325306`. The contract refuses to
trade on a price older than three hours, so if the feed stalls, buying and
selling stop while transfers keep working.

---

## The compliance gate

This is the part that matters, and it lives in `_update` — the hook every
ERC-1155 transfer passes through:

```solidity
if (from != address(0) && !_approvedList[from]) revert TransferNotAllowed(from, to);
if (to   != address(0) && !_approvedList[to])   revert TransferNotAllowed(from, to);
```

Consequences, all covered by tests:

- An unapproved address cannot receive tokens, **including** via operator
  approval (`setApprovalForAll` doesn't get you around it).
- Revoking approval **freezes** an existing holder. They keep the tokens and
  the claim on the gold, but cannot move or sell them until re-approved.
- Minting and burning still work, because `address(0)` is exempt.

The interface checks the whitelist before it lets you submit, but that is a
courtesy to save gas — the contract would reject it either way.

---

## Testing

```bash
npm run test              # contract suite + API smoke test
npm run test:contract     # 47 Hardhat tests
npm run test:api          # 35 API checks (read-only, costs no gas)
```

The contract suite leans hardest on transfer restrictions, since that is the
entire compliance claim. It also covers role enforcement, batch validation,
supply caps, oracle staleness at the three-hour boundary, purchase refunds,
sell slippage guards, the fee cap and pause behaviour. A `MockV3Aggregator`
lets tests backdate the oracle to exercise `StaleOraclePrice` without waiting.

Static analysis is configured but Slither isn't installed here:

```bash
pip3 install slither-analyzer
npm --prefix chain run slither
```

---

## Fixes made to the backend

The backend was imported from a zip and had problems that would have stopped it
working. In rough order of severity:

1. **`SEPOLIA_RPC_URL` pointed at Alchemy _mainnet_.** Everything connected
   fine, reported chain 1, and found no contract at the address. This is why
   nothing on-chain worked. Now `eth-sepolia`.

2. **`investmentController` was broken on every call.** It wrote
   `{ investor, tokens, amount }` into a model whose schema requires
   `{ user, asset, batchId, type, tokenAmount, valueWei, txHash }` — validation
   failed 100% of the time. Rewritten to record from verified receipts.

3. **`ownershipController` was broken on every call.** It computed a percentage
   from `asset.totalTokens`, a field that doesn't exist on the schema
   (it's `maxSupply`), and wrote fields the model doesn't have. Ownership is
   now derived from `balanceOf` on read rather than stored — a stored
   percentage goes stale the moment anyone trades.

4. **`config/*.js` called `process.exit(1)` at require time** when an env var
   was missing, so one absent variable killed the whole API. Now lazy and
   non-fatal: chain routes report 503 and the rest keeps serving.

5. **A failed Mongo connection also killed the process.** Same treatment, plus
   a clear "database unavailable" response instead of a 10-second buffering
   timeout.

6. **No role restrictions anywhere.** `roleMiddleware` existed but was never
   used, so any registered user could create batches. Issuer, compliance and
   admin routes are now gated, and the API smoke test asserts an investor gets
   403 from each.

7. **Port 5000 collides with macOS AirPlay Receiver**, which answers 403 and
   makes the server look broken. Moved to 5050.

8. **`pinata` was a dependency but never imported.** Removed.

Kept as-is, deliberately: the route names your teammate chose
(`/api/investments/buy`, `/api/ownership/my`) still exist and do what their
names say — only the implementations changed.

### Endpoints added

Chain reads (`/api/chain/status|batches|holdings|whitelist`), issuer operations
(mint, burn, custody reference, price feed), compliance operations (single and
bulk whitelist, removal, KYC verification), and admin operations (fee,
treasury, reserve withdrawal, pause, roles).

---

## Security notes

- **`server/.env` contains a live private key.** It's a Sepolia key so nothing
  of value is at risk, but it was shipped inside the zip you shared. Treat it
  as compromised and rotate it before this is graded or demoed publicly.
- `.env` is gitignored at every level. `.env.example` files carry the shape,
  never the values.
- Passwords are bcrypt-hashed and the hash never leaves the server — responses
  go through `toSafeUser()`.
- The password policy (8+ chars, uppercase, number, symbol) is enforced
  server-side, not just in the form.

---

## Known limits

- **The contract's ETH reserve pays sellers.** It currently holds 0.05 ETH. If
  it runs dry, `sell` reverts with `InsufficientContractBalance` — buying and
  transferring still work. Top it up by sending Sepolia ETH straight to the
  contract; it has a payable `receive()`.
- **Tokens are expensive at real gold prices.** At ~$4,100/oz a 10 g token is
  ~0.7 ETH. The seeded 1 g batch (~0.07 ETH) exists so a demo wallet can
  actually afford one.
- **AccessControl doesn't enumerate members**, so the roles screen shows
  whether the operator wallet holds each role rather than listing every holder.
  Full history is in the contract's `RoleGranted` events.
- **`isVerified` (KYC) is set by compliance through the API**; there's no
  document-upload flow — that's the domain-lead workstream, not code.
- **No subgraph.** The Graph was listed as a stretch goal; holdings are read
  directly via `balanceOf` instead.

---

## Deliverables checklist

| From the brief | Status |
| --- | --- |
| Contract deployed on Sepolia | ✅ `0xeDa6d8F8…5cc212` |
| Contract verified on Etherscan | ⚠️ verify with `npx hardhat verify` from `chain/` |
| Mint a tokenized asset with fixed supply | ✅ `createBatch` + `mint`, cap enforced |
| Transfer fractions between whitelisted holders only | ✅ enforced in `_update`, 6 dedicated tests |
| Block transfers to non-approved addresses | ✅ including via operator approval |
| React frontend | ✅ full product, not a stub |
| Hardhat test suite | ✅ 47 tests |
| Slither pass | ⚠️ configured, needs `pip3 install slither-analyzer` |
| Role-based admin for the whitelist (stretch) | ✅ four on-chain roles |
| Design document | ✅ this file |
