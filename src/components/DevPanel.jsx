import { useState } from 'react'
import { useAurum } from '../state/store'
import { api } from '../lib/api'
import { eth, short } from '../lib/format'
import { formatEther } from 'ethers'
import { ThemeChoice } from './ThemeToggle'

function Toggle({ label, checked, onChange }) {
  return (
    <label className="dev-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="dev-switch" aria-hidden="true" />
    </label>
  )
}

/**
 * Status panel. In live mode it reports what the app is actually talking to;
 * in demo mode it doubles as the design canvas's prop panel so every frame in
 * the set stays reachable without a chain.
 */
export function StatusPanel() {
  const [open, setOpen] = useState(false)
  const { demoMode, status, world, setWorld, refresh, account, chainId } = useAurum()

  return (
    <div className="dev">
      {open && (
        <div className="dev-panel">
          <span className="label">Appearance</span>
          <ThemeChoice />

          <div className="divider" />

          <span className="label">{demoMode ? 'Demo mode' : 'Live'}</span>

          {demoMode ? (
            <>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-2)' }}>
                The API at {api.baseUrl} is unreachable, so the interface is running on the
                design's own data. Nothing is sent to a chain.
              </p>
              <div className="divider" />
              <span className="label">Contract state</span>
              <Toggle
                label="Paused"
                checked={world.paused}
                onChange={(paused) => setWorld((w) => ({ ...w, paused }))}
              />
              <Toggle
                label="Price feed stale"
                checked={world.stale}
                onChange={(stale) => setWorld((w) => ({ ...w, stale }))}
              />
              <Toggle
                label="Admin tab"
                checked={world.adminAccess}
                onChange={(adminAccess) => setWorld((w) => ({ ...w, adminAccess }))}
              />
              {world.connected && (
                <button
                  type="button"
                  className="btn-quiet"
                  style={{ fontSize: 12, alignSelf: 'flex-start' }}
                  onClick={() => setWorld((w) => ({ ...w, connected: false }))}
                >
                  Disconnect wallet
                </button>
              )}
            </>
          ) : (
            <>
              <div className="dev-toggle" style={{ cursor: 'default' }}>
                <span>Network</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>
                  {chainId === 11155111 ? 'Sepolia' : (chainId ?? '—')}
                </span>
              </div>
              <div className="dev-toggle" style={{ cursor: 'default' }}>
                <span>Wallet</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>
                  {account ? short(account) : 'not connected'}
                </span>
              </div>
              <div className="dev-toggle" style={{ cursor: 'default' }}>
                <span>Reserve</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>
                  {status?.reserveWei
                    ? eth(Number(formatEther(status.reserveWei)), 4)
                    : '—'}
                </span>
              </div>
              {status?.contract && (
                <a
                  className="mono"
                  style={{ fontSize: 11.5 }}
                  href={`https://sepolia.etherscan.io/address/${status.contract}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(status.contract)} on Etherscan ↗
                </a>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={refresh}
                style={{ marginTop: 4 }}
              >
                Refresh from chain
              </button>
            </>
          )}
        </div>
      )}

      <button type="button" className="dev-tab" onClick={() => setOpen((value) => !value)}>
        {open ? 'CLOSE' : demoMode ? 'DEMO' : 'LIVE'}
      </button>
    </div>
  )
}
