import { useAurum } from '../state/store'
import { Chrome } from '../components/Chrome'
import { Section, Empty } from '../components/Panels'
import { navigate } from '../lib/router'
import { eth, grams, kg, n, usd } from '../lib/format'

function HoldingRow({ holding }) {
  const { batch, qty } = holding
  const value = batch.priceEth != null ? batch.priceEth * qty : null

  return (
    <div className="row">
      <span className="row-main">
        <a href={`#/asset/${batch.id}`} className="row-name" style={{ color: 'var(--text)' }}>
          {batch.name}
        </a>
        <span className="row-ref">{batch.ref}</span>
      </span>
      <span className="metric" style={{ width: 110 }}>
        <span className="metric-value">{n(qty)}</span>
        <span className="label">Tokens</span>
      </span>
      <span className="metric" style={{ width: 110 }}>
        <span className="metric-value" style={{ color: 'var(--text-2)' }}>
          {grams(holding.grams)}
        </span>
        <span className="label">Gold</span>
      </span>
      <span className="metric" style={{ width: 130 }}>
        <span className="metric-value gold">
          {value != null ? eth(value, 4) : '—'}
        </span>
        <span className="label">Value</span>
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => navigate(`/transfer?batch=${batch.id}`)}
      >
        Transfer
      </button>
    </div>
  )
}

export function Portfolio() {
  const { holdings, status } = useAurum()

  const totalGrams = holdings.reduce((total, h) => total + h.grams, 0)
  const priced = holdings.filter((h) => h.batch.priceEth != null)
  const totalEth = priced.reduce((total, h) => total + h.batch.priceEth * h.qty, 0)
  const totalUsd = status?.ethUsd?.price ? totalEth * status.ethUsd.price : null
  const partial = priced.length !== holdings.length
  const empty = holdings.length === 0

  return (
    <div className="shell">
      <Chrome active="Portfolio" />
      <main className="page">
        <div className="col stack">
          <div
            className="card card-roomy"
            style={{ display: 'flex', alignItems: 'center', gap: 48, flexWrap: 'wrap' }}
          >
            <div className="field-stack" style={{ gap: 10 }}>
              <span className="label">Gold held</span>
              <span className="num-lg" style={{ color: empty ? 'var(--muted)' : undefined }}>
                {grams(totalGrams)}
              </span>
              {!empty && (
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {kg(totalGrams)} across {holdings.length}{' '}
                  {holdings.length === 1 ? 'batch' : 'batches'}
                </span>
              )}
            </div>
            <div className="divider-v" />
            <div className="field-stack" style={{ gap: 10 }}>
              <span className="label">Total value</span>
              <span
                className="num-lg"
                style={{ color: empty ? 'var(--muted)' : 'var(--gold)' }}
              >
                {eth(totalEth, 4)}
              </span>
              {!empty && totalUsd != null && (
                <span className="num" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  ≈ {usd(Math.round(totalUsd))}
                  {partial && ' · some batches have no live price'}
                </span>
              )}
            </div>
          </div>

          <Section label="Holdings">
            {empty ? (
              <Empty
                action={
                  <a href="#/" className="btn btn-secondary btn-md">
                    Browse assets
                  </a>
                }
              >
                You don't hold any batches yet.
              </Empty>
            ) : (
              <div className="rows">
                {holdings.map((holding) => (
                  <HoldingRow key={holding.batch.id} holding={holding} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </main>
    </div>
  )
}
