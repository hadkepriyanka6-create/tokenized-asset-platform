import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAurum } from '../../state/store'
import { Section, Notice } from '../../components/Panels'
import { Field } from '../../components/Fields'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { date, isAddress, n, sameAddress, short } from '../../lib/format'

// MAX_WHITELIST_BATCH_SIZE on the contract.
const MAX_BULK = 10
const COLUMNS = '1fr 150px 140px 90px'

/** The registry, from the API in live mode and from the demo world otherwise. */
function useRegistry() {
  const { demoMode, world } = useAurum()
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (demoMode) {
      setRows(
        world.whitelist.map((entry) => ({
          walletAddress: entry.address,
          added: entry.added,
          onChain: true,
        })),
      )
      return
    }
    try {
      setRows(await api.compliance.registry())
      setError(null)
    } catch (problem) {
      setError(problem.message)
    }
  }, [demoMode, world])

  useEffect(() => {
    load()
  }, [load])

  return { rows, error, reload: load }
}

function RemoveModal({ entry, held, onClose, onDone }) {
  const { operator, demoMode, setWorld } = useAurum()

  const remove = () =>
    operator({
      summary: { label: 'Removing', value: short(entry.walletAddress) },
      signBody:
        'Aurum has asked your wallet to sign the removal. Approve it there to continue — nothing has changed yet.',
      pendingBody:
        "Aurum's compliance wallet is signing the removal and waiting for Sepolia to include it.",
      completeTitle: 'Approval removed',
      completeBody: `${short(entry.walletAddress)} can no longer transfer or sell. The ${n(
        held,
      )} tokens it holds are frozen until the address is approved again.`,
      execute: () => api.compliance.remove(entry.walletAddress),
      commit: () =>
        setWorld((w) => ({
          ...w,
          whitelist: w.whitelist.filter((x) => !sameAddress(x.address, entry.walletAddress)),
        })),
      onDone: () => {
        onClose()
        onDone()
      },
    })

  return (
    <Modal onClose={onClose} labelledBy="remove-title">
      <span className="modal-title" id="remove-title">
        Remove approval?
      </span>
      <div className="field">
        <span className="mono" style={{ fontSize: 13 }}>
          {short(entry.walletAddress)}
        </span>
        <span className="mono gold" style={{ fontSize: 13, marginLeft: 'auto' }}>
          {n(held)} tokens
        </span>
      </div>
      <Notice title="This freezes their tokens completely">
        They keep the {n(held)} tokens but can no longer transfer or sell them. The only way
        to unfreeze is to approve the address again.
      </Notice>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary btn-md"
          style={{ flex: 1 }}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-md"
          style={{ flex: 1 }}
          onClick={remove}
        >
          Remove approval
        </button>
      </div>
      {demoMode && (
        <span className="hint">Demo mode — nothing is sent to the chain.</span>
      )}
    </Modal>
  )
}

function AddSingle({ inputRef, rows, onDone }) {
  const { operator, setWorld } = useAurum()
  const [value, setValue] = useState('')

  const trimmed = value.trim()
  const duplicate =
    isAddress(trimmed) && rows.some((r) => sameAddress(r.walletAddress, trimmed) && r.onChain)
  const malformed = trimmed !== '' && !isAddress(trimmed)

  const approve = () =>
    operator({
      summary: { label: 'Approving', value: short(trimmed) },
      signBody:
        'Aurum has asked your wallet to sign the approval. Approve it there to continue.',
      completeTitle: 'Address approved',
      completeBody: `${short(trimmed)} can now hold and receive Aurum tokens.`,
      execute: () => api.compliance.approve(trimmed),
      commit: () =>
        setWorld((w) => ({
          ...w,
          whitelist: [...w.whitelist, { address: trimmed, added: date(new Date()) }],
        })),
      onDone: () => {
        setValue('')
        onDone()
      },
    })

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 15 }}>Add a single address</span>
      <Field
        mono
        inputRef={inputRef}
        flagged={duplicate || malformed}
        placeholder="0x…"
        spellCheck="false"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        hint={
          duplicate
            ? 'That address is already approved'
            : malformed
              ? 'An address is 0x followed by 40 hexadecimal digits'
              : undefined
        }
        hintTone="gold"
      />
      <button
        type="button"
        className="btn btn-primary btn-md btn-block"
        disabled={!isAddress(trimmed) || duplicate}
        onClick={approve}
      >
        Approve address
      </button>
    </div>
  )
}

/**
 * The contract reverts the whole batch if any address in it is already on the
 * list, so the offending line is named before anything is submitted.
 */
function AddBulk({ rows, onDone }) {
  const { operator, setWorld } = useAurum()
  const [text, setText] = useState('')

  const lines = useMemo(
    () => text.split('\n').map((line) => line.trim()).filter(Boolean),
    [text],
  )

  const problems = lines
    .map((line, index) => {
      if (!isAddress(line)) return { index, kind: 'invalid' }
      if (rows.some((r) => sameAddress(r.walletAddress, line) && r.onChain))
        return { index, kind: 'duplicate' }
      if (lines.findIndex((other) => sameAddress(other, line)) !== index)
        return { index, kind: 'repeat' }
      return null
    })
    .filter(Boolean)

  const overLimit = lines.length > MAX_BULK
  const blocked = problems.length > 0 || overLimit || lines.length === 0
  const first = problems[0]

  const message = overLimit
    ? `The contract accepts at most ${MAX_BULK} addresses in one transaction`
    : first
      ? first.kind === 'duplicate'
        ? `Line ${first.index + 1} is already approved`
        : first.kind === 'repeat'
          ? `Line ${first.index + 1} appears twice in this list`
          : `Line ${first.index + 1} isn't a valid address`
      : null

  const approve = () =>
    operator({
      summary: { label: 'Approving', value: `${lines.length} addresses` },
      signBody: 'Aurum has asked your wallet to sign the approvals.',
      completeTitle: 'Addresses approved',
      completeBody: `${lines.length} addresses can now hold and receive Aurum tokens.`,
      execute: () => api.compliance.approveBatch(lines),
      commit: () =>
        setWorld((w) => ({
          ...w,
          whitelist: [
            ...w.whitelist,
            ...lines.map((address) => ({ address, added: date(new Date()) })),
          ],
        })),
      onDone: () => {
        setText('')
        onDone()
      },
    })

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="split" style={{ alignItems: 'baseline' }}>
        <span style={{ fontSize: 15 }}>Add in bulk</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {lines.length} of {MAX_BULK} lines
        </span>
      </div>

      <div className={blocked && lines.length ? 'field field-flag' : 'field'}>
        <textarea
          rows={4}
          spellCheck="false"
          placeholder={'0x…\n0x…'}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Addresses, one per line"
        />
      </div>

      {message && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 13, color: 'var(--gold)' }}>{message}</span>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' }}>
            The contract rejects the whole batch if any address is already on the whitelist.
            Remove that line to submit the others.
          </p>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-md btn-block"
        disabled={blocked}
        onClick={approve}
      >
        Approve {n(lines.length)} {lines.length === 1 ? 'address' : 'addresses'}
      </button>
    </div>
  )
}

export function Whitelist() {
  const { batches, balanceOf, demoMode } = useAurum()
  const { rows, error, reload } = useRegistry()
  const [removing, setRemoving] = useState(null)
  const singleInput = useRef(null)

  const approved = rows.filter((row) => row.onChain !== false)

  const heldBy = (address) =>
    demoMode
      ? batches.reduce((total, batch) => total + balanceOf(batch.id, address), 0)
      : null

  return (
    <>
      <Section
        label={`Approved addresses · ${n(approved.length)}`}
        action={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => singleInput.current?.focus()}
          >
            Add address
          </button>
        }
      >
        {error && <Notice title="Couldn't load the registry">{error}</Notice>}

        <div className="card-flush">
          <div className="ledger ledger-head" style={{ gridTemplateColumns: COLUMNS }}>
            <span className="label">Address</span>
            <span className="label">Account</span>
            <span className="label" style={{ textAlign: 'right' }}>
              Status
            </span>
            <span />
          </div>

          {rows.length === 0 && (
            <div className="ledger" style={{ gridTemplateColumns: '1fr' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                No wallets have been linked to accounts yet.
              </span>
            </div>
          )}

          {rows.map((row) => {
            const held = heldBy(row.walletAddress)
            return (
              <div
                className="ledger"
                key={row.walletAddress}
                style={{ gridTemplateColumns: COLUMNS }}
              >
                <span
                  className="ledger-cell mono"
                  data-label="Address"
                  style={{ fontSize: 13, overflowWrap: 'anywhere' }}
                >
                  {row.walletAddress}
                </span>
                <span
                  className="ledger-cell"
                  data-label="Account"
                  style={{ fontSize: 13, color: 'var(--text-2)' }}
                >
                  {row.fullName || row.added || '—'}
                </span>
                <span
                  className="ledger-cell"
                  data-label="Status"
                  style={{ fontSize: 13, textAlign: 'right' }}
                >
                  {row.onChain === false ? (
                    <span style={{ color: 'var(--muted)' }}>Not approved</span>
                  ) : (
                    <span className="gold">{held != null ? `${n(held)} tokens` : 'Approved'}</span>
                  )}
                </span>
                <span style={{ textAlign: 'right' }}>
                  {row.onChain === false ? (
                    <span className="hint">—</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-quiet"
                      style={{ fontSize: 13 }}
                      onClick={() => setRemoving({ entry: row, held: held ?? 0 })}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <AddSingle inputRef={singleInput} rows={rows} onDone={reload} />
        <AddBulk rows={rows} onDone={reload} />
      </div>

      {removing && (
        <RemoveModal
          entry={removing.entry}
          held={removing.held}
          onClose={() => setRemoving(null)}
          onDone={reload}
        />
      )}
    </>
  )
}
