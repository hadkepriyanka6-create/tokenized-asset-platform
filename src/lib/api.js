const BASE = import.meta.env.VITE_API_URL || "http://localhost:5050"

const TOKEN_KEY = "aurum.token"

export const readToken = () => localStorage.getItem(TOKEN_KEY)
export const writeToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

/**
 * Every call goes through here so a failure always arrives as an ApiError with
 * the server's own message. The API already translates contract reverts into
 * plain language, so those come through unchanged.
 */
async function request(method, path, body) {
  const token = readToken()

  let response
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      `Can't reach the Aurum API at ${BASE}. Is the server running?`,
      0,
      "OFFLINE",
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    /* empty body */
  }

  if (!response.ok) {
    // An expired or rejected token means the session is over.
    if (response.status === 401 && token) clearToken()

    throw new ApiError(
      payload?.message || payload?.error || `Request failed (${response.status})`,
      response.status,
      payload?.code,
    )
  }

  return payload
}

const get = (path) => request("GET", path)
const post = (path, body) => request("POST", path, body ?? {})
const patch = (path, body) => request("PATCH", path, body ?? {})
const del = (path) => request("DELETE", path)

export const api = {
  baseUrl: BASE,

  health: () => get("/health"),

  auth: {
    register: (body) => post("/api/users/register", body),
    login: (body) => post("/api/users/login", body),
    me: () => get("/api/users/me"),
    setWallet: (walletAddress) => patch("/api/users/wallet", { walletAddress }),
    requestApproval: () => post("/api/users/request-approval"),
    list: () => get("/api/users"),
  },

  chain: {
    status: () => get("/api/chain/status"),
    batches: () => get("/api/chain/batches"),
    batch: (id) => get(`/api/chain/batches/${id}`),
    holdings: (address) => get(`/api/chain/holdings/${address}`),
    whitelisted: (address) => get(`/api/chain/whitelist/${address}`),
  },

  assets: {
    list: () => get("/api/assets"),
    create: (body) => post("/api/assets/create", body),
    mint: (batchId, amount) => post(`/api/assets/${batchId}/mint`, { amount }),
    burn: (batchId, amount) => post(`/api/assets/${batchId}/burn`, { amount }),
    setCustody: (batchId, custodyReference) =>
      patch(`/api/assets/${batchId}/custody`, { custodyReference }),
    setFeed: (batchId, priceFeedAddress) =>
      patch(`/api/assets/${batchId}/feed`, { priceFeedAddress }),
  },

  compliance: {
    registry: () => get("/api/compliance/whitelist"),
    approve: (address) => post("/api/compliance/whitelist", { address }),
    approveBatch: (addresses) => post("/api/compliance/whitelist/batch", { addresses }),
    remove: (address) => del(`/api/compliance/whitelist/${address}`),
    setVerified: (id, isVerified) =>
      patch(`/api/compliance/users/${id}/verify`, { isVerified }),
  },

  admin: {
    setFee: (bps) => patch("/api/admin/fee", { bps }),
    setTreasury: (address) => patch("/api/admin/treasury", { address }),
    withdraw: (keepEth) => post("/api/admin/withdraw", { keepEth }),
    pause: () => post("/api/admin/pause"),
    unpause: () => post("/api/admin/unpause"),
    roles: () => get("/api/admin/roles"),
    grantRole: (role, address) => post("/api/admin/roles/grant", { role, address }),
    revokeRole: (role, address) => post("/api/admin/roles/revoke", { role, address }),
  },

  portfolio: {
    mine: () => get("/api/ownership/my"),
  },

  transactions: {
    mine: () => get("/api/transactions/my-transactions"),
    recordBuy: (txHash) => post("/api/investments/buy", { txHash }),
    recordSell: (txHash) => post("/api/investments/sell", { txHash }),
    record: (type, txHash) => post("/api/transactions/create", { type, txHash }),
  },
}
