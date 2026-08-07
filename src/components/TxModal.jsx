import { Modal } from './Modal'
import { useAurum } from '../state/store'
import { short } from '../lib/format'

function TxLink({ hash }) {
  // Operator transactions have no hash until the API returns one.
  if (!hash) return null

  return (
    <div className="summary" style={{ flexDirection: 'row' }}>
      <div className="split" style={{ width: '100%' }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Transaction</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="mono" style={{ fontSize: 13 }}>
            {short(hash)}
          </span>
          <a
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12.5, color: 'var(--text-2)' }}
          >
            Etherscan ↗
          </a>
        </span>
      </div>
    </div>
  )
}

/**
 * Every write in Aurum runs through these four states: waiting on the wallet,
 * pending on Sepolia, complete, or reverted by the contract.
 */
export function TxModal() {
  const { tx, closeTx } = useAurum()
  if (!tx) return null

  const { stage } = tx

  return (
    <Modal onClose={closeTx} width="narrow" flagged={stage === 'failed'} labelledBy="tx-title">
      {stage === 'sign' && (
        <>
          <div className="tx-head">
            <span className="spinner" />
            <span id="tx-title">Confirm in your wallet</span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}>
            {tx.signBody}
          </p>
          {tx.summary && (
            <div className="summary" style={{ flexDirection: 'row' }}>
              <div className="split" style={{ width: '100%' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {tx.summary.label}
                </span>
                <span className="mono" style={{ fontSize: 13 }}>
                  {tx.summary.value}
                </span>
              </div>
            </div>
          )}
          <button type="button" className="btn btn-secondary btn-md btn-block" onClick={closeTx}>
            Cancel
          </button>
        </>
      )}

      {stage === 'pending' && (
        <>
          <div className="tx-head">
            <span className="spinner spinner-pending" />
            <span id="tx-title">Pending on Sepolia</span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}>
            {tx.pendingBody}
          </p>
          <TxLink hash={tx.hash} />
          <button type="button" className="btn btn-secondary btn-md btn-block" onClick={closeTx}>
            Close
          </button>
        </>
      )}

      {stage === 'complete' && (
        <>
          <div className="tx-head">
            <span className="tx-mark" aria-hidden="true">
              ✓
            </span>
            <span id="tx-title">{tx.completeTitle}</span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}>
            {tx.completeBody}
          </p>
          <TxLink hash={tx.hash} />
          <button
            type="button"
            className="btn btn-primary btn-md btn-block"
            onClick={() => {
              const { onDone, hash } = tx
              closeTx()
              onDone?.(hash)
            }}
          >
            Done
          </button>
        </>
      )}

      {stage === 'failed' && (
        <>
          <div className="tx-head">
            <span className="tx-mark" aria-hidden="true">
              !
            </span>
            <span id="tx-title">Transaction failed</span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}>
            {tx.failBody}
          </p>
          <TxLink hash={tx.hash} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              style={{ flex: 1 }}
              onClick={closeTx}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary btn-md"
              style={{ flex: 1 }}
              onClick={() => {
                const { onRetry } = tx
                closeTx()
                onRetry?.()
              }}
            >
              Edit and retry
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
