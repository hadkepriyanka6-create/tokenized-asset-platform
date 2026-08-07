import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { formatEther, parseEther } from 'ethers'
import { api, ApiError, clearToken, readToken, writeToken } from '../lib/api'
import { describeRevert, SEPOLIA } from '../lib/abi'
import * as wallet from '../lib/wallet'
import { sellQuote } from '../lib/pricing'
import * as demo from './demo'

const AurumContext = createContext(null)

const wei = (value) => (value == null ? null : Number(formatEther(value)))

/** API batch → the shape every screen reads. */
function normalise(batch, ethUsd) {
  const priceEth = batch.priceWei ? wei(batch.priceWei) : null
  return {
    id: batch.batchId,
    name: batch.name || batch.custodyReference,
    ref: batch.custodyReference,
    symbol: batch.assetSymbol,
    gramsPerToken: batch.gramsPerToken,
    maxSupply: batch.maxSupply,
    minted: batch.mintedSupply,
    inventory: batch.inventory,
    circulating: batch.circulating,
    headroom: batch.headroom,
    priceWei: batch.priceWei,
    priceEth,
    priceUsd: priceEth != null && ethUsd ? priceEth * ethUsd : null,
    priceError: batch.priceError,
    feed: batch.feed,
  }
}

const sameAddress = (a, b) =>
  Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase()

export function AurumProvider({ children }) {
  const [mode, setMode] = useState('connecting') // connecting | live | demo
  const [booted, setBooted] = useState(false)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(null)
  const [batches, setBatches] = useState([])
  const [holdings, setHoldings] = useState([])
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [whitelisted, setWhitelisted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tx, setTx] = useState(null)

  // Demo mode keeps its own mutable world so the screens stay walkable with
  // no server, no database and no funded wallet.
  const [world, setWorld] = useState(null)
  const timers = useRef([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  /* ------------------------------------------------------------------ boot */

  const enterDemo = useCallback(() => {
    setMode('demo')
    setWorld({
      batches: demo.demoBatches(),
      balances: demo.demoBalances(),
      whitelist: demo.demoWhitelist(),
      roles: demo.demoRoles(),
      status: demo.demoStatus(),
      paused: false,
      stale: false,
      adminAccess: true,
      account: demo.DEMO_ACCOUNT,
      connected: false,
    })
    setUser(demo.demoUser())
    setLoading(false)
    setBooted(true)
  }, [])

  const loadChain = useCallback(async (address) => {
    const [chainStatus, chainBatches] = await Promise.all([
      api.chain.status(),
      api.chain.batches(),
    ])
    setStatus(chainStatus)

    const ethUsd = chainStatus?.ethUsd?.price
    setBatches(chainBatches.map((batch) => normalise(batch, ethUsd)))

    if (address) {
      const [owned, approval] = await Promise.all([
        api.chain.holdings(address).catch(() => []),
        api.chain.whitelisted(address).catch(() => ({ whitelisted: false })),
      ])
      setHoldings(
        owned.map((holding) => ({
          batch: normalise(holding.batch, ethUsd),
          qty: holding.quantity,
          grams: holding.grams,
        })),
      )
      setWhitelisted(Boolean(approval.whitelisted))
    } else {
      setHoldings([])
      setWhitelisted(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (mode === 'demo') return
    try {
      const profile = readToken() ? await api.auth.me().catch(() => null) : null
      if (profile) setUser(profile)
      await loadChain(profile?.walletAddress ?? account)
    } catch {
      /* a transient read failure shouldn't blank the screen */
    }
  }, [mode, account, loadChain])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        await api.health()
        if (cancelled) return
        setMode('live')

        const profile = readToken() ? await api.auth.me().catch(() => null) : null
        if (cancelled) return
        if (profile) setUser(profile)

        const connected = await wallet.currentAccount().catch(() => null)
        if (connected) {
          setAccount(connected)
          setChainId(await wallet.currentChainId().catch(() => null))
        }

        await loadChain(profile?.walletAddress ?? connected)
      } catch {
        // The API is unreachable — fall back to the design's own data so the
        // interface is still demonstrable.
        if (!cancelled) enterDemo()
        return
      }
      if (!cancelled) {
        setLoading(false)
        setBooted(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enterDemo, loadChain])

  // MetaMask account/network changes have to move the app, not just the wallet.
  useEffect(() => {
    if (mode !== 'live') return undefined
    return wallet.watch({
      onAccountsChanged: (next) => {
        setAccount(next)
        refresh()
      },
      onChainChanged: (next) => setChainId(next),
    })
  }, [mode, refresh])

  /* ------------------------------------------------- transaction lifecycle */

  const closeTx = useCallback(() => setTx(null), [])

  /** A transaction the holder signs in their own wallet. */
  const runWalletTx = useCallback(
    async ({
      summary,
      signBody,
      pendingBody,
      completeTitle = 'Complete',
      completeBody,
      execute,
      after,
      onDone,
    }) => {
      setTx({ stage: 'sign', summary, signBody })

      try {
        const response = await execute()
        setTx((t) => (t ? { ...t, stage: 'pending', pendingBody, hash: response.hash } : t))

        const receipt = await response.wait()
        await after?.(receipt)
        await refresh()

        setTx((t) =>
          t
            ? {
                ...t,
                stage: 'complete',
                completeTitle,
                completeBody:
                  typeof completeBody === 'function' ? completeBody(receipt) : completeBody,
                hash: receipt.hash,
                onDone,
              }
            : t,
        )
      } catch (error) {
        const message = describeRevert(error)
        setTx((t) => (t ? { ...t, stage: 'failed', failBody: message } : t))
      }
    },
    [refresh],
  )

  /**
   * An operator action. The server wallet holds the issuer, compliance and
   * admin roles, so there is nothing for the holder to sign — the API returns
   * once the transaction is mined.
   */
  const runOperatorTx = useCallback(
    async ({ summary, pendingBody, completeTitle = 'Complete', completeBody, execute, onDone }) => {
      setTx({
        stage: 'pending',
        summary,
        pendingBody:
          pendingBody ??
          "Aurum's operator wallet is signing this and waiting for Sepolia to include it. You can close this — it will finish either way.",
      })

      try {
        const result = await execute()
        await refresh()

        setTx((t) =>
          t
            ? {
                ...t,
                stage: 'complete',
                completeTitle,
                completeBody:
                  (typeof completeBody === 'function' ? completeBody(result) : completeBody) ??
                  result?.message,
                hash: result?.txHash,
                onDone,
              }
            : t,
        )
      } catch (error) {
        setTx((t) =>
          t ? { ...t, stage: 'failed', failBody: error.message || 'The transaction failed.' } : t,
        )
      }
    },
    [refresh],
  )

  /** Demo mode: the same four states, on timers, mutating the local world. */
  const runDemoTx = useCallback(
    ({ summary, signBody, pendingBody, completeTitle = 'Complete', completeBody, revert, commit, onDone }) => {
      clearTimers()
      const hash = `0x${Array.from({ length: 64 }, () =>
        '0123456789abcdef'[Math.floor(Math.random() * 16)],
      ).join('')}`

      setTx({ stage: 'sign', summary, signBody, hash })

      timers.current.push(
        setTimeout(() => {
          if (revert) {
            setTx((t) => (t ? { ...t, stage: 'failed', failBody: revert } : t))
            return
          }
          setTx((t) => (t ? { ...t, stage: 'pending', pendingBody } : t))

          timers.current.push(
            setTimeout(() => {
              commit?.()
              setTx((t) =>
                t ? { ...t, stage: 'complete', completeTitle, completeBody, onDone } : t,
              )
            }, 1700),
          )
        }, 1200),
      )
    },
    [clearTimers],
  )

  /**
   * One entry point for every operator action, so an admin screen doesn't have
   * to know whether it is talking to the API or to the demo world.
   */
  const operator = useCallback(
    (options) => (mode === 'demo' ? runDemoTx(options) : runOperatorTx(options)),
    [mode, runDemoTx, runOperatorTx],
  )

  /* ---------------------------------------------------------------- session */

  // The holdings and whitelist routes are authenticated, so the chain reads
  // taken at boot came back empty. Reload them once there is a token.
  const signIn = useCallback(
    async (credentials) => {
      const result = await api.auth.login(credentials)
      writeToken(result.token)
      setUser(result.user)
      await loadChain(result.user.walletAddress ?? (await wallet.currentAccount().catch(() => null)))
      return result.user
    },
    [loadChain],
  )

  const signUp = useCallback(
    async (details) => {
      const result = await api.auth.register(details)
      writeToken(result.token)
      setUser(result.user)
      await loadChain(result.user.walletAddress ?? null)
      return result.user
    },
    [loadChain],
  )

  const signOut = useCallback(() => {
    clearToken()
    setUser(null)
    setHoldings([])
    setWhitelisted(false)
    setAccount(null)
  }, [])

  /* ----------------------------------------------------------------- wallet */

  /**
   * @param pick force MetaMask's account picker open, for attaching a
   *             different wallet than the one it already has permission for.
   */
  const connectWallet = useCallback(async ({ pick = false } = {}) => {
    if (mode === 'demo') {
      setWorld((w) => ({ ...w, connected: true }))
      return demo.DEMO_ACCOUNT
    }

    const address = pick ? await wallet.selectAccount() : await wallet.connect()
    const currentChain = await wallet.currentChainId()

    setAccount(address)
    setChainId(currentChain)

    if (currentChain === SEPOLIA.chainId) {
      await api.auth.setWallet(address).catch((error) => {
        // A 409 means the address belongs to a different account — surface it.
        if (error instanceof ApiError && error.status === 409) throw error
      })
      await refresh()
    }

    return address
  }, [mode, refresh])

  const switchNetwork = useCallback(async () => {
    await wallet.switchToSepolia()
    const next = await wallet.currentChainId()
    setChainId(next)
    if (next === SEPOLIA.chainId && account) {
      await api.auth.setWallet(account).catch(() => {})
      await refresh()
    }
  }, [account, refresh])

  const requestApproval = useCallback(async () => {
    if (mode === 'demo') {
      setUser((u) => ({ ...u, approvalRequestedAt: new Date().toISOString() }))
      return
    }
    const result = await api.auth.requestApproval()
    setUser(result.user)
  }, [mode])

  /* ------------------------------------------------------ holder operations */

  const contractAddress = mode === 'demo' ? world?.status.contract : status?.contract

  const buy = useCallback(
    async (batch, qty, texts) => {
      if (mode === 'demo') return runDemoTx(texts)

      const contract = await wallet.getContract(contractAddress)
      // The contract re-reads the feed at execution and refunds any excess, so
      // a 1% cushion covers a price tick between the quote and the block.
      const total =
        (BigInt(batch.priceWei) * BigInt(qty) * BigInt(10000 + status.royaltyFeeBps)) / 10000n
      const value = (total * 101n) / 100n

      return runWalletTx({
        ...texts,
        execute: () => contract.purchase(batch.id, qty, { value }),
        after: (receipt) => api.transactions.recordBuy(receipt.hash).catch(() => {}),
      })
    },
    [mode, contractAddress, status, runWalletTx, runDemoTx],
  )

  const sell = useCallback(
    async (batch, qty, texts) => {
      if (mode === 'demo') return runDemoTx(texts)

      const contract = await wallet.getContract(contractAddress)
      const quote = sellQuote(batch.priceEth, qty, status.royaltyFeeBps)
      const minPayout = parseEther(quote.floor.toFixed(18))

      return runWalletTx({
        ...texts,
        execute: () => contract.sell(batch.id, qty, minPayout),
        after: (receipt) => api.transactions.recordSell(receipt.hash).catch(() => {}),
      })
    },
    [mode, contractAddress, status, runWalletTx, runDemoTx],
  )

  const transfer = useCallback(
    async (batch, qty, to, texts) => {
      if (mode === 'demo') return runDemoTx(texts)

      const contract = await wallet.getContract(contractAddress)
      return runWalletTx({
        ...texts,
        execute: () => contract.safeTransferFrom(account, to, batch.id, qty, '0x'),
      })
    },
    [mode, contractAddress, account, runWalletTx, runDemoTx],
  )

  const isRecipientWhitelisted = useCallback(
    async (address) => {
      if (mode === 'demo') {
        return world.whitelist.some((entry) => sameAddress(entry.address, address))
      }
      const result = await api.chain.whitelisted(address)
      return result.whitelisted
    },
    [mode, world],
  )

  /* ----------------------------------------------------- derived / exposure */

  const value = useMemo(() => {
    const demoMode = mode === 'demo'
    const activeStatus = demoMode ? { ...world?.status, paused: world?.paused } : status
    const activeBatches = demoMode
      ? world.batches.map((b) =>
          world.stale ? { ...b, priceEth: null, feed: { ...b.feed, stale: true } } : b,
        )
      : batches

    const activeAccount = demoMode ? (world?.connected ? world.account : null) : account
    const balanceOf = (batchId, address = activeAccount) => {
      if (demoMode) {
        const key = Object.keys(world.balances).find((k) => sameAddress(k, address))
        return key ? (world.balances[key][batchId] ?? 0) : 0
      }
      return holdings.find((h) => h.batch.id === batchId)?.qty ?? 0
    }

    const activeHoldings = demoMode
      ? world.batches
          .map((batch) => ({ batch, qty: balanceOf(batch.id) }))
          .filter((h) => h.qty > 0)
          .map((h) => ({ ...h, grams: h.qty * h.batch.gramsPerToken }))
      : holdings

    return {
      mode,
      demoMode,
      booted,
      loading,
      user,
      account: activeAccount,
      chainId: demoMode ? SEPOLIA.chainId : chainId,
      onWrongNetwork: !demoMode && Boolean(account) && chainId !== SEPOLIA.chainId,

      // A wallet MetaMask happens to have unlocked is not the same as a wallet
      // attached to this account — approval is per address, so the link has to
      // be explicit before the app will let anyone through.
      linked: demoMode
        ? Boolean(world?.connected)
        : Boolean(account) && sameAddress(user?.walletAddress, account),
      hasWallet: demoMode ? true : wallet.hasWallet(),
      status: activeStatus,
      contractAddress,
      batches: activeBatches,
      holdings: activeHoldings,
      whitelisted: demoMode ? true : whitelisted,
      paused: Boolean(activeStatus?.paused),
      stale: demoMode
        ? world.stale
        : activeBatches.some((b) => b.feed?.stale) && activeBatches.length > 0,
      feeBps: activeStatus?.royaltyFeeBps ?? 250,
      showAdmin: demoMode
        ? world.adminAccess
        : ['Admin', 'Issuer', 'Compliance'].includes(user?.role),
      role: user?.role ?? 'Investor',

      // world mutation, demo only
      world,
      setWorld,

      // actions
      tx,
      closeTx,
      refresh,
      signIn,
      signUp,
      signOut,
      connectWallet,
      switchNetwork,
      requestApproval,
      buy,
      sell,
      transfer,
      isRecipientWhitelisted,
      balanceOf,
      runWalletTx,
      runOperatorTx,
      runDemoTx,
      operator,
      batchById: (id) => activeBatches.find((b) => b.id === Number(id)) ?? null,
    }
  }, [
    mode,
    world,
    booted,
    loading,
    user,
    account,
    chainId,
    status,
    batches,
    holdings,
    whitelisted,
    contractAddress,
    tx,
    closeTx,
    refresh,
    signIn,
    signUp,
    signOut,
    connectWallet,
    switchNetwork,
    requestApproval,
    buy,
    sell,
    transfer,
    isRecipientWhitelisted,
    runWalletTx,
    runOperatorTx,
    runDemoTx,
    operator,
  ])

  return <AurumContext.Provider value={value}>{children}</AurumContext.Provider>
}

export const useAurum = () => {
  const value = useContext(AurumContext)
  if (!value) throw new Error('useAurum must be used inside <AurumProvider>')
  return value
}

export const useHoldings = () => useAurum().holdings
