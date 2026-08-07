# Starting Aurum

Works the same on macOS, Windows and Linux. Where a command differs, both are
given. You need **Node 18+** and **Git**; on Windows use **PowerShell** or
**Command Prompt** — every `npm` command below runs unchanged in either.

## First time

```bash
npm run setup
```

Installs all three workspaces (frontend, `server/`, `chain/`).

### MongoDB

The API needs a MongoDB running on `mongodb://127.0.0.1:27017`. Install it once:

**macOS**

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Windows** — download the MongoDB Community **MSI** from
[mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
and run it. Two things matter in the installer:

- Choose **Complete**, not Custom.
- Leave **"Install MongoDB as a Service"** ticked — it then starts on boot and
  you never have to think about it again.

"Install MongoDB Compass" is optional; it's a GUI for browsing the data, handy
but not needed.

Verify from a new terminal:

```bat
net start MongoDB
```

`The requested service has already been started` is the answer you want.

**Linux (Debian/Ubuntu)**

```bash
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

Check it's up:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

> **No install? Use Atlas instead.** Create a free cluster at
> [cloud.mongodb.com](https://cloud.mongodb.com), then put the connection string
> in `MONGO_URI` in `server/.env`. Nothing else changes — add your IP to the
> Atlas network access list and it just works.

### Configure the API

```bash
cp server/.env.example server/.env              # macOS / Linux
copy server\.env.example server\.env            # Windows
```

**Then open `server/.env` and fill it in.** It ships empty on purpose; the real
values are not in this zip. You need:

| Variable | What to put there |
| --- | --- |
| `SEPOLIA_RPC_URL` | An Alchemy or Infura **Sepolia** URL. Check the host says `eth-sepolia`, not `eth-mainnet` — a mainnet URL connects fine and then reports "no contract deployed". |
| `CONTRACT_ADDRESS` | `0xeDa6d8F811B1b97d57D9cBaCBFDf515Cba5cc212` (already deployed on Sepolia) |
| `PRIVATE_KEY` | A Sepolia wallet's key, 64 hex chars, no `0x`. Needs Sepolia ETH for gas. |
| `JWT_SECRET` | Any long random string |
| `MONGO_URI` | Leave as-is for a local MongoDB, or paste your Atlas connection string |

Without `PRIVATE_KEY` the app still runs — you can read everything, but issuer,
compliance and admin actions will return 503.

---

## Every time

MongoDB runs as a background service, so once it's installed there is nothing to
start — just:

```bash
npm run dev:all
```

- Web → <http://localhost:5173>
- API → <http://localhost:5050>

If the API logs `MongoDB connection failed`, the service isn't running:

```bash
brew services start mongodb-community     # macOS
sudo systemctl start mongod               # Linux
net start MongoDB                         # Windows, in an admin prompt
```

Or run them separately in two terminals:

```bash
npm run dev        # frontend only
npm run dev:api    # API only
```

**The frontend works without the API.** If it can't reach the server it falls
back to demo mode with sample data, so the interface is always viewable. The
badge in the bottom-right corner reads `LIVE` or `DEMO`.

---

## Stopping

`Ctrl-C` in the terminal stops the web and API.

MongoDB keeps running in the background, which is normally what you want. To
stop it too:

```bash
brew services stop mongodb-community      # macOS
sudo systemctl stop mongod                # Linux
net stop MongoDB                          # Windows, in an admin prompt
```

---

## Using it

1. Register an account at <http://localhost:5173>
2. Connect MetaMask, on the **Sepolia** network
3. You'll hit "This address isn't approved" — that's the compliance gate
   working. An admin has to whitelist your wallet.

### Making yourself an admin

There is no API route that raises your own privileges, by design. Do it from
the command line:

```bash
npm --prefix server run set-role -- you@example.com Admin
```

Log out and back in — the role is inside the JWT.

Then go to **Admin → Whitelist**, paste your wallet address, and approve it.
That sends a real transaction from the operator wallet.

### If no batches show up

The contract needs batches to exist. Check first, then create:

```bash
npm run chain:setup          # dry run — simulates everything, sends nothing
npm run chain:setup:send     # grants roles, whitelists the operator, seeds batches
```

---

## Tests

```bash
npm test              # contract suite + API smoke test
npm run test:contract # 47 Hardhat tests, no network needed
npm run test:api      # 35 API checks — needs the API running
```

---

## Troubleshooting

**Port 5050 already in use** — change `PORT` in `server/.env`, and update
`VITE_API_URL` in a `.env.local` at the repo root to match.

**Port 5000 gives 403 on macOS** — that's AirPlay Receiver, not your server.
This project uses 5050 to avoid it. Not a problem on Windows.

**Frontend on 5174 instead of 5173** — a stale process is holding the port.
It matters because `CORS_ORIGIN` in `server/.env` lists 5173; on another port
the API calls fail and the app silently drops to demo mode.

```bash
pkill -f vite                                   # macOS / Linux
```

```powershell
Get-Process node | Stop-Process -Force          # Windows PowerShell
```

**`mongosh` / `node` not recognised on Windows** — the installer added them to
PATH but your terminal was already open. Close it and open a new one.

**PowerShell blocks `npm.ps1`** — if you see *"running scripts is disabled on
this system"*, run this once in an admin PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Everything reads zero / "no contract deployed"** — your `SEPOLIA_RPC_URL` is
pointing at mainnet.

**Selling reverts** — the contract's ETH reserve is empty. Send Sepolia ETH
straight to the contract address; it has a payable `receive()`.
