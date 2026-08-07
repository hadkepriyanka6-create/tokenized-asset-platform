import { useState } from 'react'
import { useAurum } from '../state/store'
import { Wordmark } from '../components/Chrome'
import { ThemeToggle } from '../components/ThemeToggle'
import { Notice } from '../components/Panels'
import { navigate } from '../lib/router'
import { SEPOLIA } from '../lib/abi'
import { short } from '../lib/format'

const PITCH =
  'Tokenized gold, held in custody and moved on-chain between approved holders.'

function EntryChrome({ chip, children }) {
  const { user, account, signOut, demoMode } = useAurum()

  return (
    <div className="shell">
      <header className="masthead">
        <div className="col masthead-inner">
          <div className="brand">
            <Wordmark />
            {chip && <span className="chip">{chip}</span>}
            {demoMode && <span className="chip">Demo</span>}
          </div>
          <div className="account">
            <span className="name" style={{ fontSize: 13 }}>
              {user?.fullName}
            </span>
            {account && (
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {short(account)}
              </span>
            )}
            <span className="avatar" />
            <button
              type="button"
              className="btn-quiet logout"
              style={{ fontSize: 13 }}
              onClick={() => {
                signOut()
                navigate('/')
              }}
            >
              Log out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

/** Signed in, but no wallet attached to the account yet. */
export function Connect() {
  const { connectWallet, hasWallet, account, user } = useAurum()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // MetaMask may already have an account unlocked, and the account may have a
  // different address on file. Both need an explicit action before the app
  // treats this wallet as the one approval is tied to.
  const unlinked = Boolean(account) && !user?.walletAddress
  const mismatch =
    Boolean(account) &&
    Boolean(user?.walletAddress) &&
    user.walletAddress.toLowerCase() !== account.toLowerCase()

  const connect = async (pick = false) => {
    setBusy(true)
    setError(null)
    try {
      await connectWallet({ pick })
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntryChrome>
      <div className="centered">
        <div className="entry">
          <span className="mark-lg" />
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-2)' }}>{PITCH}</p>

          {hasWallet ? (
            <>
              <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                Aurum is permissioned. Connect the wallet you intend to hold with — approval
                is tied to that address.
              </p>

              {mismatch && (
                <Notice title="A different wallet is selected">
                  This account is linked to {short(user.walletAddress)} but your wallet is on{' '}
                  {short(account)}. Switch back in MetaMask, or link this address instead.
                </Notice>
              )}

              {unlinked && (
                <div className="field" style={{ width: '100%' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Selected</span>
                  <span className="mono" style={{ fontSize: 13, marginLeft: 'auto' }}>
                    {short(account)}
                  </span>
                </div>
              )}

              {error && (
                <Notice title={error}>
                  {/^this wallet is already linked/i.test(error)
                    ? 'Approval is tied to one address, so a wallet can belong to only one account. Sign in to the account that already owns it, or pick a different address below.'
                    : null}
                </Notice>
              )}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => connect(false)}
                  disabled={busy}
                >
                  {busy
                    ? 'Waiting on your wallet…'
                    : account
                      ? `Link ${short(account)}`
                      : 'Connect wallet'}
                </button>

                {/* MetaMask returns the same account silently once a site has
                    permission, so switching needs an explicit request. */}
                <button
                  type="button"
                  className="btn-quiet"
                  style={{ fontSize: 13 }}
                  onClick={() => connect(true)}
                  disabled={busy}
                >
                  Use a different wallet
                </button>
              </div>
            </>
          ) : (
            <>
              <Notice title="No Ethereum wallet found">
                Aurum needs a browser wallet to sign transactions. Install MetaMask, then
                reload this page.
              </Notice>
              <a
                className="btn btn-secondary"
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
              >
                Get MetaMask ↗
              </a>
            </>
          )}

          <a href="#/custody" style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
            Read how custody works
          </a>
        </div>
      </div>
    </EntryChrome>
  )
}

export function WrongNetwork() {
  const { switchNetwork, chainId } = useAurum()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const change = async () => {
    setBusy(true)
    setError(null)
    try {
      await switchNetwork()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntryChrome chip="Wrong network">
      <div className="centered">
        <div className="entry">
          <span className="mark-lg" />
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-2)' }}>{PITCH}</p>
          <div
            className="card"
            style={{
              width: '100%',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 13.5 }}>Wrong network</span>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' }}>
              Aurum runs on {SEPOLIA.name}. Your wallet is on chain {chainId ?? 'unknown'}.
            </p>
          </div>
          {error && <Notice title={error} />}
          <button type="button" className="btn btn-primary" onClick={change} disabled={busy}>
            {busy ? 'Waiting on your wallet…' : 'Switch to Sepolia'}
          </button>
        </div>
      </div>
    </EntryChrome>
  )
}

/**
 * The compliance gate. The contract rejects any transfer whose sender or
 * recipient is not whitelisted, so an unapproved wallet gets this instead of
 * the app — this is enforced on-chain, not here.
 */
export function NotApproved() {
  const { account, user, requestApproval, refresh } = useAurum()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const requested = Boolean(user?.approvalRequestedAt)

  const request = async () => {
    setBusy(true)
    setError(null)
    try {
      await requestApproval()
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntryChrome chip={requested ? 'Pending' : 'Not approved'}>
      <div className="centered">
        <div className="gate">
          <span className="label">Access</span>
          <h1 className="title">
            {requested ? 'Approval requested' : "This address isn't approved yet"}
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--text-2)' }}>
            {requested
              ? "Compliance has your address and will add it to the whitelist once checks are complete. You'll be able to hold and receive tokens as soon as that transaction confirms — nothing further is needed from you here."
              : 'Aurum is permissioned. Only addresses approved by compliance can hold or receive tokens — the contract rejects transfers to anyone else. Approval is tied to this wallet, so use the address you intend to hold with.'}
          </p>

          <div
            className="card"
            style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div className="split">
              <span className="label">Connected address</span>
              <span className="mono" style={{ fontSize: 13 }}>
                {short(account)}
              </span>
            </div>
            {requested && (
              <>
                <div className="divider" />
                <div className="split">
                  <span className="label">Requested</span>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {new Date(user.approvalRequestedAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </>
            )}
            {user?.isVerified === false && (
              <>
                <div className="divider" />
                <div className="split">
                  <span className="label">KYC</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Not yet verified</span>
                </div>
              </>
            )}
          </div>

          {error && <Notice title={error} />}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={requested || busy}
              onClick={request}
            >
              {requested ? 'Request pending' : busy ? 'Requesting…' : 'Request approval'}
            </button>
            <button type="button" className="btn-quiet" style={{ fontSize: 13.5 }} onClick={refresh}>
              Check again
            </button>
            <a href="#/custody" style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
              Read how custody works
            </a>
          </div>
        </div>
      </div>
    </EntryChrome>
  )
}
