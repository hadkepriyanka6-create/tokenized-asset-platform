import { useEffect, useState } from 'react'
import { useAurum } from '../state/store'
import { Chrome } from '../components/Chrome'
import { Section, Line } from '../components/Panels'
import { Field, QuantityInput } from '../components/Fields'
import { navigate } from '../lib/router'
import { buyQuote, sellQuote, supplyOf } from '../lib/pricing'
import { age, dec, eth, n, usd } from '../lib/format'

function PricePanel({ batch }) {
  const { status } = useAurum()
  const minutes = Math.round((batch.feed?.ageSeconds ?? 0) / 60)

  // The contract refuses to price against a feed older than three hours, so
  // tokenPriceInWei reverts and the quote is simply unavailable.
  if (batch.priceEth == null) {
    return (
      <Section label="Price">
        <div
          className="card"
          style={{
            borderColor: 'var(--notice-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className="bullet-sm" />
            <span style={{ fontSize: 15, color: 'var(--gold)' }}>Price unavailable</span>
          </div>
          <p
            style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)', maxWidth: 640 }}
          >
            {batch.priceError ||
              "The gold price hasn't updated recently."}{' '}
            Aurum only trades on a price under three hours old, so buying and selling are
            unavailable until the feed refreshes. Transfers between approved holders are
            unaffected.
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 6, flexWrap: 'wrap' }}>
            <div className="field-stack" style={{ gap: 5 }}>
              <span className="label">Feed</span>
              <span className="num" style={{ color: 'var(--text-2)' }}>
                {batch.feed?.description ?? '—'}
              </span>
            </div>
            <div className="field-stack" style={{ gap: 5 }}>
              <span className="label">Last update</span>
              <span className="num" style={{ color: 'var(--text-2)' }}>
                {batch.feed ? `${age(minutes)} ago` : 'unknown'}
              </span>
            </div>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <Section label="Price">
      <div
        className="card"
        style={{ display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}
      >
        <div className="field-stack" style={{ gap: 7 }}>
          <span className="mono gold" style={{ fontSize: 30, lineHeight: 1.1 }}>
            {eth(batch.priceEth)}
          </span>
          {batch.priceUsd != null && (
            <span className="num" style={{ color: 'var(--text-2)' }}>
              ≈ {usd(batch.priceUsd, 2)} per token
            </span>
          )}
        </div>
        <div className="divider-v" />
        <div className="field-stack" style={{ gap: 7 }}>
          <span className="label">Derived from</span>
          <span className="num">
            {batch.feed?.description ?? 'XAU / USD'} {usd(batch.feed?.price ?? 0, 2)}/oz
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Chainlink · updated {age(minutes)} ago
            {status?.ethUsd?.price ? ` · ETH ${usd(status.ethUsd.price, 2)}` : ''}
          </span>
        </div>
      </div>
    </Section>
  )
}

function SupplyPanel({ batch }) {
  const supply = supplyOf(batch)
  const stats = [
    { label: 'Minted', value: n(batch.minted) },
    { label: 'Maximum', value: n(batch.maxSupply) },
    { label: 'Available to buy', value: n(batch.inventory), tone: 'gold' },
    { label: 'In circulation', value: n(supply.circulating) },
  ]

  return (
    <Section label="Supply">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 24,
          }}
        >
          {stats.map((stat) => (
            <div className="field-stack" style={{ gap: 6 }} key={stat.label}>
              <span className="label">{stat.label}</span>
              <span
                className="mono"
                style={{
                  fontSize: 20,
                  color: stat.tone === 'gold' ? 'var(--gold)' : 'var(--text)',
                }}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="bar">
            <div className="bar-circulating" style={{ width: `${supply.circulatingPct}%` }} />
            <div className="bar-inventory" style={{ width: `${supply.inventoryPct}%` }} />
          </div>
          <div className="legend">
            <span className="legend-item">
              <span className="swatch" style={{ background: 'var(--gold)' }} />
              In circulation
            </span>
            <span className="legend-item">
              <span className="swatch" style={{ background: 'var(--gold-dim)' }} />
              Held for sale
            </span>
            <span className="legend-item">
              <span className="swatch" style={{ background: 'var(--raised)' }} />
              Unminted headroom {n(supply.headroom)}
            </span>
          </div>
        </div>
      </div>
    </Section>
  )
}

function BuyPanel({ batch }) {
  const { feeBps, buy, balanceOf, whitelisted } = useAurum()
  const [raw, setRaw] = useState('1')
  const qty = Number(raw || 0)
  const quote = buyQuote(batch.priceEth, qty, feeBps)
  const overInventory = qty > batch.inventory
  const balance = balanceOf(batch.id)

  const submit = () =>
    buy(batch, qty, {
      summary: {
        label: 'Buying',
        value: `${n(qty)} tokens · ${n(qty * batch.gramsPerToken)} g`,
      },
      signBody:
        'Aurum has asked your wallet to sign the purchase. Approve it there to continue — nothing has been sent yet.',
      pendingBody:
        'Submitted and waiting to be included in a block. You can close this — it will finish either way.',
      completeBody: `${n(qty)} tokens of ${batch.name}, representing ${n(
        qty * batch.gramsPerToken,
      )} g of gold, are now held by your address.`,
      revert: overInventory
        ? `Only ${n(batch.inventory)} tokens are available in this batch, so the contract rejected the purchase.`
        : null,
      onDone: () => navigate('/portfolio'),
    })

  return (
    <div
      style={{
        padding: 24,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 32,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field
          label="Quantity"
          flagged={overInventory}
          hint={
            overInventory
              ? `Only ${n(batch.inventory)} available in this batch`
              : `${n(batch.inventory)} available in this batch`
          }
          hintTone={overInventory ? 'gold' : 'muted'}
        >
          <QuantityInput aria-label="Quantity to buy" value={raw} onChange={setRaw} />
          <span className="field-suffix">
            tokens · {n(qty * batch.gramsPerToken)} g
          </span>
        </Field>

        <div className="summary">
          <Line label="Price per token" value={eth(quote.unit)} />
          <Line label="Subtotal" value={eth(quote.subtotal)} />
          <Line label={`Fee ${dec(feeBps / 100, 2)}%`} value={eth(quote.fee)} />
          <div className="divider" style={{ margin: '2px 0' }} />
          <Line label="Total" value={eth(quote.total)} tone="gold" size="lg" />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 14,
        }}
      >
        {balance > 0 && (
          <span className="hint">You already hold {n(balance)} tokens of this batch.</span>
        )}
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
          The price is re-checked against the Chainlink feed when the transaction runs, so the
          amount charged may differ slightly from the quote above. Aurum sends 1% over the
          total and the contract refunds the difference in the same transaction.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={qty < 1 || !whitelisted}
          onClick={submit}
        >
          {!whitelisted
            ? 'Your address is not approved'
            : qty < 1
              ? 'Enter a quantity'
              : `Buy ${n(qty)} tokens`}
        </button>
      </div>
    </div>
  )
}

function SellPanel({ batch }) {
  const { feeBps, sell, balanceOf, whitelisted } = useAurum()
  const balance = balanceOf(batch.id)
  const [raw, setRaw] = useState(() => String(Math.min(1, balance)))
  const qty = Number(raw || 0)
  const quote = sellQuote(batch.priceEth, qty, feeBps)
  const overBalance = qty > balance

  const submit = () =>
    sell(batch, qty, {
      summary: {
        label: 'Selling',
        value: `${n(qty)} tokens · ${n(qty * batch.gramsPerToken)} g`,
      },
      signBody:
        'Aurum has asked your wallet to sign the sale. Approve it there to continue — nothing has been sent yet.',
      pendingBody:
        'Submitted and waiting to be included in a block. You can close this — it will finish either way.',
      completeBody: `${n(qty)} tokens returned to Aurum's inventory and about ${eth(
        quote.net,
      )} was paid to your address from the contract reserve.`,
      revert: overBalance
        ? `You hold ${n(balance)} tokens of this batch, so the contract rejected the sale.`
        : null,
      onDone: () => navigate('/portfolio'),
    })

  return (
    <div
      style={{
        padding: 24,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 32,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field
          label="Quantity"
          flagged={overBalance}
          hint={`You hold ${n(balance)} tokens of this batch`}
          hintTone={overBalance ? 'gold' : 'muted'}
        >
          <QuantityInput aria-label="Quantity to sell" value={raw} onChange={setRaw} />
          <span className="field-suffix">
            tokens · {n(qty * batch.gramsPerToken)} g
          </span>
        </Field>

        <Field
          label="Minimum payout"
          hint="Transaction reverts if the payout falls below this — 1% under the current quote."
        >
          <span className="mono" style={{ flex: 1, fontSize: 15 }}>
            {dec(quote.floor, 5)}
          </span>
          <span className="field-suffix">ETH</span>
        </Field>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="summary">
          <Line label="Price per token" value={eth(quote.unit)} />
          <Line label="Gross" value={eth(quote.gross)} />
          <Line label={`Fee ${dec(feeBps / 100, 2)}%`} value={`−${eth(quote.fee)}`} />
          <div className="divider" style={{ margin: '2px 0' }} />
          <Line label="Net payout" value={eth(quote.net)} tone="gold" size="lg" />
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
          The price is re-checked when the transaction runs. Tokens return to Aurum's
          inventory and the payout is sent from the contract reserve.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={qty < 1 || balance === 0 || !whitelisted}
          onClick={submit}
        >
          {balance === 0
            ? 'You hold none of this batch'
            : qty < 1
              ? 'Enter a quantity'
              : `Sell ${n(qty)} tokens`}
        </button>
      </div>
    </div>
  )
}

function Unavailable({ title, detail }) {
  return (
    <Section label="Trade">
      <div
        className="card"
        style={{
          padding: 34,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{title}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{detail}</span>
      </div>
    </Section>
  )
}

function TradePanel({ batch }) {
  const { paused } = useAurum()
  const [side, setSide] = useState('buy')

  if (batch.priceEth == null) {
    return (
      <Unavailable
        title="Trading is paused until the price feed updates."
        detail="You can still transfer tokens you already hold."
      />
    )
  }

  if (paused) {
    return (
      <Unavailable
        title="Aurum is paused. Buying and selling are unavailable."
        detail="Your tokens are unaffected — the pauser can lift this at any time."
      />
    )
  }

  return (
    <Section label="Trade">
      <div className="card-flush">
        <div className="switch">
          <button type="button" aria-current={side === 'buy'} onClick={() => setSide('buy')}>
            Buy
          </button>
          <button type="button" aria-current={side === 'sell'} onClick={() => setSide('sell')}>
            Sell
          </button>
        </div>
        {side === 'buy' ? <BuyPanel batch={batch} /> : <SellPanel batch={batch} />}
      </div>
    </Section>
  )
}

export function AssetDetail({ batchId }) {
  const { batchById, loading } = useAurum()
  const batch = batchById(batchId)

  useEffect(() => {
    if (!loading && !batch) navigate('/')
  }, [loading, batch])

  if (!batch) return null

  return (
    <div className="shell">
      <Chrome active="Overview" />
      <main className="page" style={{ paddingTop: 36 }}>
        <div className="col" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <a href="#/" style={{ fontSize: 13, color: 'var(--text-2)' }}>
            ← Overview
          </a>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            <div className="field-stack">
              <h1 className="title-lg">{batch.name}</h1>
              <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {batch.ref} · {batch.symbol} · token #{batch.id}
              </span>
            </div>
            <div className="metric">
              <span className="mono" style={{ fontSize: 20 }}>
                {batch.gramsPerToken} g
              </span>
              <span className="label">Per token</span>
            </div>
          </div>

          <PricePanel batch={batch} />
          <SupplyPanel batch={batch} />
          <TradePanel batch={batch} />
        </div>
      </main>
    </div>
  )
}
