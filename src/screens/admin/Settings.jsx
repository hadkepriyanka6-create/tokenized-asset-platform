import { useState } from 'react'
import { formatEther } from 'ethers'
import { useAurum } from '../../state/store'
import { Field } from '../../components/Fields'
import { api } from '../../lib/api'
import { dec, eth, isAddress, n, pct, short } from '../../lib/format'

function RoyaltyFee() {
  const { status, feeBps, operator, setWorld } = useAurum()
  const [value, setValue] = useState(String(feeBps))

  const bps = Number(value || 0)
  const maxBps = status?.maxFeeBps ?? 1000
  const overMax = bps > maxBps
  const unchanged = bps === feeBps

  const update = () =>
    operator({
      summary: { label: 'New fee', value: `${n(bps)} bps` },
      signBody: 'Aurum has asked your wallet to sign the fee change.',
      completeTitle: 'Fee updated',
      completeBody: `Buys and sells now carry a ${pct(bps / 100)} fee.`,
      revert: overMax ? `The contract caps the fee at ${n(maxBps)} bps.` : null,
      execute: () => api.admin.setFee(bps),
      commit: () =>
        setWorld((w) => ({ ...w, status: { ...w.status, royaltyFeeBps: bps } })),
    })

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 15 }}>Royalty fee</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span className="mono gold" style={{ fontSize: 30 }}>
          {pct(feeBps / 100)}
        </span>
        <span className="mono" style={{ fontSize: 14, color: 'var(--text-2)' }}>
          {n(feeBps)} bps
        </span>
      </div>
      <Field
        flagged={overMax}
        mono
        inputMode="numeric"
        aria-label="Fee in basis points"
        value={value}
        onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ''))}
        suffix="basis points"
      />
      <span style={{ fontSize: 12, color: overMax ? 'var(--gold)' : 'var(--text-2)' }}>
        Charged on buys and sells only. Maximum {n(maxBps)} bps ({pct(maxBps / 100)}).
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-md btn-block"
        disabled={unchanged || value === ''}
        onClick={update}
      >
        Update fee
      </button>
    </div>
  )
}

function Treasury() {
  const { status, operator, setWorld } = useAurum()
  const [address, setAddress] = useState(status?.treasury ?? '')

  const trimmed = address.trim()
  const malformed = trimmed !== '' && !isAddress(trimmed)

  const update = () =>
    operator({
      summary: { label: 'New treasury', value: short(trimmed) },
      signBody: 'Aurum has asked your wallet to sign the treasury change.',
      completeTitle: 'Treasury updated',
      completeBody: `Fees and withdrawals are now sent to ${short(trimmed)}.`,
      execute: () => api.admin.setTreasury(trimmed),
      commit: () => setWorld((w) => ({ ...w, status: { ...w.status, treasury: trimmed } })),
    })

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 15 }}>Treasury address</span>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
        Fees and withdrawals are sent here.
      </span>
      <Field
        mono
        spellCheck="false"
        flagged={malformed}
        aria-label="Treasury address"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        hint={malformed ? "That isn't a valid Ethereum address" : undefined}
        hintTone="gold"
      />
      <button
        type="button"
        className="btn btn-secondary btn-md btn-block"
        disabled={!isAddress(trimmed) || trimmed === status?.treasury}
        onClick={update}
      >
        Update treasury
      </button>
    </div>
  )
}

/**
 * The reserve is what `sell` pays out from. If it runs dry the contract
 * reverts with InsufficientContractBalance and holders can't redeem.
 */
function Reserve() {
  const { status, operator, setWorld } = useAurum()
  const balance = status?.reserveWei ? Number(formatEther(status.reserveWei)) : 0
  const [keep, setKeep] = useState(() => (balance / 2).toFixed(4))

  const kept = Number(keep || 0)
  const out = balance - kept
  const overBalance = kept > balance

  const withdraw = () =>
    operator({
      summary: { label: 'Withdrawing', value: eth(out, 4) },
      signBody: 'Aurum has asked your wallet to sign the withdrawal.',
      completeTitle: 'Withdrawn',
      completeBody: `${eth(out, 4)} was sent to the treasury at ${short(
        status?.treasury,
      )}. The contract keeps ${eth(kept, 4)} to pay sellers.`,
      revert: overBalance
        ? `The contract holds ${eth(balance, 4)}, so it cannot keep more than that.`
        : null,
      execute: () => api.admin.withdraw(kept.toFixed(6)),
      commit: () =>
        setWorld((w) => ({
          ...w,
          status: { ...w.status, reserveWei: String(BigInt(Math.round(kept * 1e18))) },
        })),
    })

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div className="field-stack" style={{ gap: 9 }}>
          <span className="label">Contract ETH reserve</span>
          <span
            className="mono"
            style={{ fontSize: 30, color: balance === 0 ? 'var(--gold)' : 'var(--text)' }}
          >
            {eth(balance, 4)}
          </span>
        </div>
        <span
          style={{ fontSize: 12.5, color: 'var(--text-2)', maxWidth: 420, textAlign: 'right' }}
        >
          This balance pays sellers. Keep enough here to cover redemptions you expect — at
          zero, every sale reverts.
        </span>
      </div>

      <div className="divider" />

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <Field
            label="Amount to keep in the contract"
            mono
            inputMode="decimal"
            flagged={overBalance}
            value={keep}
            onChange={(event) => setKeep(event.target.value.replace(/[^\d.]/g, ''))}
            suffix="ETH"
            hint={
              overBalance
                ? 'More than the contract holds'
                : `${dec(Math.max(out, 0), 4)} ETH will be sent to the treasury`
            }
            hintTone="gold"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-md"
          disabled={overBalance || out <= 0}
          onClick={withdraw}
        >
          Withdraw the rest
        </button>
      </div>

      <span className="hint">
        To top the reserve up, send Sepolia ETH straight to the contract — it has a payable
        receive().
      </span>
    </div>
  )
}

export function Settings() {
  return (
    <>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <RoyaltyFee />
        <Treasury />
      </div>
      <Reserve />
    </>
  )
}
