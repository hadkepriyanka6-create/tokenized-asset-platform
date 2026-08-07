import { useEffect, useState } from 'react'
import { useAurum } from '../state/store'
import { Chrome } from '../components/Chrome'
import { Notice, NoticeBlock, Line, TextLine, Empty } from '../components/Panels'
import { Field, QuantityInput, Select } from '../components/Fields'
import { grams, isAddress, n, sameAddress, short } from '../lib/format'

/**
 * The compliance gate, inline. Every result here mirrors a revert the contract
 * would produce — the check is a courtesy so the holder doesn't pay gas to
 * learn the same thing.
 */
function RecipientCheck({ result }) {
  if (result.state === 'checking') {
    return (
      <span className="hint" style={{ paddingLeft: 2 }}>
        Checking the whitelist…
      </span>
    )
  }

  if (result.state === 'ok') {
    return (
      <div className="field">
        <span className="bullet" />
        <span style={{ fontSize: 13 }}>Approved to receive tokens</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
          On-chain whitelist
        </span>
      </div>
    )
  }

  if (result.state === 'blocked') {
    return (
      <Notice title="This address isn't approved to receive tokens">
        Aurum only allows transfers between whitelisted addresses, so the contract would
        reject this one. Ask compliance to approve it, or send to an address that's already
        on the whitelist.
      </Notice>
    )
  }

  if (result.state === 'contract') {
    return (
      <Notice title="This is Aurum's own contract address">
        Tokens sent here are lost — the contract has no way to return them. To convert tokens
        back to ETH, use sell on the asset page instead.
      </Notice>
    )
  }

  if (result.state === 'self') {
    return (
      <Notice title="This is your own address">
        The transfer would succeed but move nothing. Enter the address you mean to send to.
      </Notice>
    )
  }

  if (result.state === 'invalid') {
    return (
      <Notice title="That isn't a valid Ethereum address">
        An address is 42 characters: 0x followed by 40 hexadecimal digits.
      </Notice>
    )
  }

  if (result.state === 'error') {
    return <Notice title="Couldn't check the whitelist">{result.message}</Notice>
  }

  return null
}

export function Transfer({ preselected }) {
  const {
    account,
    holdings,
    paused,
    transfer,
    balanceOf,
    isRecipientWhitelisted,
    contractAddress,
  } = useAurum()

  const [batchId, setBatchId] = useState(() => preselected ?? holdings[0]?.batch.id ?? null)
  const [raw, setRaw] = useState('1')
  const [recipient, setRecipient] = useState('')
  const [check, setCheck] = useState({ state: 'empty' })

  const holding = holdings.find((h) => h.batch.id === batchId) ?? holdings[0] ?? null
  const batch = holding?.batch
  const balance = batch ? balanceOf(batch.id) : 0
  const qty = Number(raw || 0)

  // The whitelist lives on-chain, so the check is a network call. Debounced so
  // it fires once the address stops changing rather than on every keystroke.
  useEffect(() => {
    const value = recipient.trim()

    if (!value) return setCheck({ state: 'empty' })
    if (!isAddress(value)) return setCheck({ state: 'invalid' })
    if (sameAddress(value, contractAddress)) return setCheck({ state: 'contract' })
    if (sameAddress(value, account)) return setCheck({ state: 'self' })

    setCheck({ state: 'checking' })
    let cancelled = false

    const timer = setTimeout(async () => {
      try {
        const approved = await isRecipientWhitelisted(value)
        if (!cancelled) setCheck({ state: approved ? 'ok' : 'blocked' })
      } catch (error) {
        if (!cancelled) setCheck({ state: 'error', message: error.message })
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [recipient, account, contractAddress, isRecipientWhitelisted])

  const overBalance = qty > balance
  const ready = !paused && check.state === 'ok' && qty >= 1 && !overBalance && Boolean(batch)

  const submit = () => {
    const goldMoved = qty * batch.gramsPerToken
    const to = recipient.trim()

    transfer(batch, qty, to, {
      summary: { label: 'Transferring', value: `${n(qty)} tokens · ${grams(goldMoved)}` },
      signBody:
        'Aurum has asked your wallet to sign the transfer. Approve it there to continue — nothing has been sent yet.',
      pendingBody:
        'Submitted and waiting to be included in a block. You can close this — it will finish either way.',
      completeTitle: 'Transfer complete',
      completeBody: `${n(qty)} tokens — ${grams(goldMoved)} of gold — are now held by ${short(
        to,
      )}. Your balance is ${n(balance - qty)} tokens.`,
      onDone: () => {
        setRaw('1')
        setRecipient('')
      },
    })
  }

  return (
    <div className="shell">
      <Chrome active="Transfer" />
      <main className="page">
        <div className="col" style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: '100%',
              maxWidth: 'var(--col-form)',
              display: 'flex',
              flexDirection: 'column',
              gap: 26,
            }}
          >
            <div className="field-stack">
              <h1 className="title">Transfer</h1>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)' }}>
                Move tokens to another approved address. Transfers between holders carry no
                fee.
              </p>
            </div>

            {!batch ? (
              <Empty
                action={
                  <a href="#/" className="btn btn-secondary btn-md">
                    Browse assets
                  </a>
                }
              >
                You don't hold any batches yet, so there is nothing to transfer.
              </Empty>
            ) : (
              <>
                {paused && (
                  <NoticeBlock title="Aurum is paused">
                    Transfers and trading are unavailable while the contract is paused. Your
                    tokens are unaffected — the pauser can lift this at any time.
                  </NoticeBlock>
                )}

                <fieldset
                  className="card card-roomy"
                  disabled={paused}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 22,
                    opacity: paused ? 0.4 : 1,
                    margin: 0,
                    minWidth: 0,
                  }}
                >
                  <Select
                    label="Batch"
                    value={batch.id}
                    onChange={(event) => setBatchId(Number(event.target.value))}
                    trailing={
                      <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {n(balance)} available
                      </span>
                    }
                  >
                    {holdings.map((h) => (
                      <option key={h.batch.id} value={h.batch.id}>
                        {h.batch.name}
                      </option>
                    ))}
                  </Select>

                  <Field
                    label="Amount"
                    flagged={overBalance}
                    trailing={
                      <>
                        <span className="field-suffix">tokens</span>
                        <button
                          type="button"
                          className="max"
                          onClick={() => setRaw(String(balance))}
                        >
                          Max
                        </button>
                      </>
                    }
                  >
                    <QuantityInput
                      aria-label="Amount in tokens"
                      value={raw}
                      onChange={setRaw}
                    />
                  </Field>
                  <div className="split" style={{ marginTop: -14 }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      = {grams(qty * batch.gramsPerToken)} of gold
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Balance {n(balance)}
                    </span>
                  </div>

                  <div className="field-stack">
                    <Field
                      label="Recipient address"
                      flagged={!['empty', 'ok', 'checking'].includes(check.state)}
                      mono
                      spellCheck="false"
                      autoComplete="off"
                      placeholder="0x…"
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                    />
                    <RecipientCheck result={check} />
                  </div>
                </fieldset>

                <div
                  className="card card-tight"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 11,
                    opacity: ready ? 1 : 0.45,
                  }}
                >
                  <Line label="From" value={short(account)} />
                  <Line
                    label="To"
                    value={isAddress(recipient.trim()) ? short(recipient.trim()) : '—'}
                  />
                  <TextLine label="Batch" value={batch.name} />
                  <Line label="Amount" value={`${n(qty)} tokens`} />
                  <Line
                    label="Gold"
                    value={grams(qty * batch.gramsPerToken)}
                    tone={ready ? 'gold' : undefined}
                  />
                  {ready && (
                    <>
                      <div className="divider" style={{ margin: '1px 0' }} />
                      <TextLine
                        label="Fee"
                        value="None — transfers between holders are free"
                      />
                    </>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={!ready}
                  onClick={submit}
                >
                  {paused
                    ? 'Transfers paused'
                    : qty < 1
                      ? 'Enter an amount'
                      : `Send ${n(qty)} tokens`}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
