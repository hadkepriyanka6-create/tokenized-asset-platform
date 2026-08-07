import { useAurum } from '../state/store'
import { Chrome, MarketingChrome } from '../components/Chrome'
import { Line } from '../components/Panels'
import { ATTESTATION } from '../state/demo'
import { TROY_OUNCE_GRAMS } from '../lib/pricing'
import { dec, grams, n, usd } from '../lib/format'

const RISKS = [
  {
    name: 'The custodian',
    body: "The gold is only as safe as the vault holding it. Aurum cannot verify the metal itself and relies on the custodian's attestations; a false attestation, a loss, or an insolvency dispute would leave tokens backed by less than they claim.",
  },
  {
    name: 'The price feed',
    body: 'Pricing depends on Chainlink. If the feed stalls, trading halts. If it reports a wrong price within the freshness window, trades execute at that wrong price.',
  },
  {
    name: 'Admin keys',
    body: "The admin roles can mint, change fees up to 10%, withdraw the contract's ETH, pause everything, and revoke approvals. In this project all four roles sit on a single address, so a compromise of that key compromises all of it.",
  },
  {
    name: 'Revocable access',
    body: 'Holding tokens is conditional. Compliance can remove an address at any time, and a frozen holder has no on-chain route to exit until the decision is reversed.',
  },
]

const COLUMNS = '1fr 90px 90px 110px'

/** Tokens issued × grams per token, checked against the attested holding. */
function Reconciliation() {
  const { batches } = useAurum()

  const committed = batches.reduce((total, b) => total + b.minted * b.gramsPerToken, 0)
  const issued = batches.reduce((total, b) => total + b.minted, 0)
  const surplus = ATTESTATION.grams - committed

  return (
    <div className="card-flush">
      <div className="ledger ledger-head" style={{ gridTemplateColumns: COLUMNS, gap: 12 }}>
        <span className="label">Batch</span>
        <span className="label" style={{ textAlign: 'right' }}>
          Tokens
        </span>
        <span className="label" style={{ textAlign: 'right' }}>
          Per
        </span>
        <span className="label" style={{ textAlign: 'right' }}>
          Gold
        </span>
      </div>

      {batches.map((batch) => (
        <div
          key={batch.id}
          className="ledger"
          style={{ gridTemplateColumns: COLUMNS, gap: 12, padding: '12px 18px' }}
        >
          <span className="ledger-cell" style={{ fontSize: 13.5 }}>
            {batch.name}
          </span>
          <span
            className="ledger-cell mono"
            data-label="Tokens"
            style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}
          >
            {n(batch.minted)}
          </span>
          <span
            className="ledger-cell mono"
            data-label="Per"
            style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}
          >
            {batch.gramsPerToken} g
          </span>
          <span
            className="ledger-cell mono"
            data-label="Gold"
            style={{ fontSize: 13, textAlign: 'right' }}
          >
            {grams(batch.minted * batch.gramsPerToken)}
          </span>
        </div>
      ))}

      <div
        className="ledger"
        style={{
          gridTemplateColumns: COLUMNS,
          gap: 12,
          padding: '13px 18px',
          borderBottomColor: 'var(--border)',
        }}
      >
        <span style={{ fontSize: 13.5 }}>Committed on-chain</span>
        <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>
          {n(issued)}
        </span>
        <span />
        <span className="mono" style={{ fontSize: 13.5, textAlign: 'right' }}>
          {grams(committed)}
        </span>
      </div>

      <div
        className="ledger"
        style={{
          gridTemplateColumns: COLUMNS,
          gap: 12,
          padding: '13px 18px',
          borderBottomColor: 'var(--border)',
        }}
      >
        <span style={{ fontSize: 13.5 }}>Attested in vault · {ATTESTATION.date}</span>
        <span />
        <span />
        <span className="mono gold" style={{ fontSize: 13.5, textAlign: 'right' }}>
          {grams(ATTESTATION.grams)}
        </span>
      </div>

      <div
        className="ledger"
        style={{ gridTemplateColumns: COLUMNS, gap: 12, padding: '13px 18px' }}
      >
        <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
          {surplus < 0 ? 'Shortfall' : 'Unallocated surplus'}
        </span>
        <span />
        <span />
        <span
          className="mono"
          style={{
            fontSize: 13.5,
            textAlign: 'right',
            color: surplus < 0 ? 'var(--gold)' : 'var(--text-2)',
          }}
        >
          {grams(Math.abs(surplus))}
        </span>
      </div>
    </div>
  )
}

export function Custody() {
  const { user, batches, status } = useAurum()

  const reference = batches.find((b) => b.priceEth != null) ?? batches[0] ?? null
  const goldUsd = reference?.feed?.price ?? null
  const ethUsd = status?.ethUsd?.price ?? null
  const perGramUsd = goldUsd ? goldUsd / TROY_OUNCE_GRAMS : null

  return (
    <div className="shell">
      {user ? <Chrome active="Overview" /> : <MarketingChrome active="Custody" />}

      <main className="prose">
        <div className="prose-block">
          <span className="label">Custody and backing</span>
          <h1 className="display">What stands behind an Aurum token</h1>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--text-2)' }}>
            Every token on Aurum is a claim on a fixed weight of physical gold held by a
            custodian. This page sets out what that claim is, who holds the metal, how the
            on-chain supply is checked against the vault, and where the arrangement can fail.
          </p>
          <p className="aside">
            This is a student project on Ethereum Sepolia. The custodian, the vault holdings
            and the attestations described below are hypothetical — no physical gold is held
            and no token here carries any real claim. The price feed, the contract and every
            balance shown are real.
          </p>
        </div>

        <div className="prose-block">
          <h2 className="heading">What one token represents</h2>
          <p className="body">
            A token is a fractional interest in one batch of allocated gold. Each batch fixes
            a weight per token when it is created — the contract stores it as
            `gramsPerToken` and there is no function that can change it. The metal is
            investment-grade bullion of at least 995 fineness, held allocated: identified bars
            set aside for the batch, not a share of a general pool.
          </p>
          <p className="body">
            Holding a token is a claim on that weight, not on any specific bar, and not on the
            custodian directly. Tokens are not redeemable for physical delivery. The route out
            is to sell tokens back to Aurum for ETH at the prevailing gold price, or to
            transfer them to another approved holder.
          </p>
        </div>

        <div className="prose-block">
          <h2 className="heading">Who holds the gold</h2>
          <p className="body">
            The metal sits with commercial vault operators under an allocated custody
            agreement — Loomis in Zürich, Malca-Amit in the Singapore FreePort, and Brink's in
            London. Aurum is the account holder; the custodian is a bailee, holding the gold
            for Aurum rather than owning it, so the bars do not form part of the custodian's
            estate if it fails.
          </p>
          <p className="body">
            Each batch carries a custody reference that maps to a specific holding line in the
            custodian's records. Those references are stored on-chain, appear on every batch
            in the app, and are the link between what exists on-chain and what sits in the
            vault.
          </p>
        </div>

        <div className="prose-block" style={{ gap: 16 }}>
          <h2 className="heading">Supply against the vault</h2>
          <p className="body">
            Tokens issued × grams per token gives the weight the contract has committed. That
            figure must never exceed the attested holding. The custodian attests monthly; the
            figures below are from {ATTESTATION.date}, checked against live on-chain supply.
          </p>
          <Reconciliation />
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--muted)' }}>
            The surplus is metal held but not yet issued against. A negative figure would mean
            tokens outstanding against gold that isn't there; if that ever appeared, minting
            would stop until it was resolved.
          </p>
        </div>

        <div className="prose-block">
          <h2 className="heading">How the price is calculated</h2>
          <p className="body">
            Aurum does not set a price. It reads the gold price from a Chainlink feed,
            converts to a per-gram figure using the troy ounce, multiplies by the batch weight,
            and converts to ETH using the ETH/USD feed.
          </p>
          <div
            className="card"
            style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 11 }}
          >
            <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>
              XAU/USD ÷ {TROY_OUNCE_GRAMS} × grams per token ÷ ETH/USD
            </span>
            <div className="divider" />
            {goldUsd && perGramUsd && reference ? (
              <>
                <Line label="Gold price" value={`${usd(goldUsd, 2)} / oz`} />
                <Line label="Per gram" value={usd(perGramUsd, 4)} />
                <Line
                  label={`× ${reference.gramsPerToken} g per token`}
                  value={usd(perGramUsd * reference.gramsPerToken, 2)}
                />
                <Line
                  label={ethUsd ? `÷ ETH/USD ${usd(ethUsd, 2)}` : '÷ ETH/USD'}
                  value={reference.priceEth != null ? `${dec(reference.priceEth, 5)} ETH` : '—'}
                  tone="gold"
                />
              </>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                No live feed reading is available right now.
              </span>
            )}
          </div>
          <p className="body">
            The contract refuses to trade on a price older than three hours. If the feed stops
            updating, buying and selling stop with it; transfers between approved holders
            continue, since they don't depend on a price.
          </p>
        </div>

        <div className="prose-block">
          <h2 className="heading">Who can hold tokens</h2>
          <p className="body">
            Aurum is permissioned. An address must pass identity and sanctions checks before
            compliance adds it to the on-chain whitelist, and the contract rejects any transfer
            whose sender or recipient is not on that list. This is enforced in `_update`, the
            hook every ERC-1155 transfer passes through — not in the interface. There is no
            path around it.
          </p>
          <p className="body">
            Approval can be revoked. A revoked address keeps its tokens and its claim on the
            underlying gold, but cannot transfer or sell them: the balance is frozen until the
            address is approved again. Approval is per address, so moving to a new wallet means
            being approved again first.
          </p>
        </div>

        <div className="prose-block">
          <h2 className="heading">Risks</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {RISKS.map((risk) => (
              <div className="risk" key={risk.name}>
                <span className="risk-name">{risk.name}</span>
                <p className="risk-body">{risk.body}</p>
              </div>
            ))}
          </div>
        </div>

        {status?.contract && (
          <div className="prose-block">
            <h2 className="heading">The contract</h2>
            <div
              className="card"
              style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 11 }}
            >
              <div className="line">
                <span>Address</span>
                <a
                  className="mono"
                  style={{ fontSize: 13 }}
                  href={`https://sepolia.etherscan.io/address/${status.contract}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {status.contract} ↗
                </a>
              </div>
              <Line label="Network" value={`Sepolia · chain ${status.chainId}`} />
              <Line label="Standard" value="ERC-1155, one id per batch" />
              <Line label="Fee" value={`${dec(status.royaltyFeeBps / 100, 2)}% on buys and sells`} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
