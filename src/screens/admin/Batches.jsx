import { useState } from 'react'
import { useAurum } from '../../state/store'
import { Section, Notice } from '../../components/Panels'
import { Field, QuantityInput, Select } from '../../components/Fields'
import { api } from '../../lib/api'
import { grams, isAddress, n } from '../../lib/format'
import { supplyOf } from '../../lib/pricing'

const COLUMNS = '1fr 110px 150px 150px'

// Sepolia Chainlink XAU/USD — the feed the seeded batches price against.
const XAU_USD_FEED = '0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea'

function BatchTable() {
  const { batches } = useAurum()

  return (
    <Section label="Batches">
      <div className="card-flush">
        <div className="ledger ledger-head" style={{ gridTemplateColumns: COLUMNS }}>
          <span className="label">Batch</span>
          <span className="label" style={{ textAlign: 'right' }}>
            Per token
          </span>
          <span className="label" style={{ textAlign: 'right' }}>
            Minted / max
          </span>
          <span className="label" style={{ textAlign: 'right' }}>
            In inventory
          </span>
        </div>

        {batches.map((batch) => (
          <div className="ledger" key={batch.id} style={{ gridTemplateColumns: COLUMNS }}>
            <span
              className="ledger-cell"
              style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <a href={`#/asset/${batch.id}`} style={{ fontSize: 14, color: 'var(--text)' }}>
                {batch.name}
              </a>
              <span className="row-ref">{batch.ref}</span>
            </span>
            <span
              className="ledger-cell mono"
              data-label="Per token"
              style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}
            >
              {batch.gramsPerToken} g
            </span>
            <span
              className="ledger-cell mono gold"
              data-label="Minted / max"
              style={{ fontSize: 13, textAlign: 'right' }}
            >
              {n(batch.minted)} / {n(batch.maxSupply)}
            </span>
            <span
              className="ledger-cell mono"
              data-label="In inventory"
              style={{ fontSize: 13, textAlign: 'right' }}
            >
              {n(batch.inventory)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

const BLANK = {
  maxSupply: '',
  gramsPerToken: '',
  assetSymbol: 'XAU',
  priceFeedAddress: XAU_USD_FEED,
  custodyReference: '',
  name: '',
}

function CreateBatch() {
  const { operator, setWorld, batches } = useAurum()
  const [form, setForm] = useState(BLANK)

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const digits = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value.replace(/[^\d]/g, '') }))

  const valid =
    Number(form.maxSupply) > 0 &&
    Number(form.gramsPerToken) > 0 &&
    form.assetSymbol.trim() !== '' &&
    form.name.trim() !== '' &&
    form.custodyReference.trim() !== '' &&
    isAddress(form.priceFeedAddress)

  const create = () =>
    operator({
      summary: { label: 'Creating', value: form.custodyReference.trim() },
      signBody: 'Aurum has asked your wallet to sign the batch creation.',
      completeTitle: 'Batch created',
      completeBody: `${form.name.trim()} exists on-chain with a cap of ${n(
        Number(form.maxSupply),
      )} tokens at ${form.gramsPerToken} g each. Nothing is minted yet.`,
      execute: () =>
        api.assets.create({
          maxSupply: Number(form.maxSupply),
          gramsPerToken: Number(form.gramsPerToken),
          assetSymbol: form.assetSymbol.trim(),
          priceFeedAddress: form.priceFeedAddress.trim(),
          custodyReference: form.custodyReference.trim(),
          name: form.name.trim(),
        }),
      commit: () =>
        setWorld((w) => ({
          ...w,
          batches: [
            ...w.batches,
            {
              id: Math.max(0, ...w.batches.map((b) => b.id)) + 1,
              name: form.name.trim(),
              ref: form.custodyReference.trim(),
              symbol: form.assetSymbol.trim(),
              gramsPerToken: Number(form.gramsPerToken),
              maxSupply: Number(form.maxSupply),
              minted: 0,
              inventory: 0,
              circulating: 0,
              headroom: Number(form.maxSupply),
              priceEth: Number(form.gramsPerToken) * (batches[0]?.priceEth ?? 0) /
                (batches[0]?.gramsPerToken || 1),
              feed: batches[0]?.feed,
            },
          ],
        })),
      onDone: () => setForm(BLANK),
    })

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <span style={{ fontSize: 15 }}>Create batch</span>

      <div className="grid-3">
        <Field
          label="Maximum supply"
          mono
          inputMode="numeric"
          placeholder="8000"
          value={form.maxSupply}
          onChange={digits('maxSupply')}
        />
        <Field
          label="Grams per token"
          mono
          inputMode="numeric"
          placeholder="20"
          value={form.gramsPerToken}
          onChange={digits('gramsPerToken')}
        />
        <Field
          label="Asset symbol"
          mono
          placeholder="XAU"
          spellCheck="false"
          value={form.assetSymbol}
          onChange={set('assetSymbol')}
        />
        <div style={{ gridColumn: 'span 2' }}>
          <Field
            label="Batch name"
            placeholder="Dubai DMCC — 20 g Minted Bars"
            value={form.name}
            onChange={set('name')}
          />
        </div>
        <Field
          label="Custody reference"
          mono
          placeholder="TRANSGD-DXB-26-0011"
          spellCheck="false"
          value={form.custodyReference}
          onChange={set('custodyReference')}
        />
        <div style={{ gridColumn: 'span 3' }}>
          <Field
            label="Chainlink feed address"
            mono
            spellCheck="false"
            flagged={!isAddress(form.priceFeedAddress)}
            value={form.priceFeedAddress}
            onChange={set('priceFeedAddress')}
            hint="Sepolia XAU/USD is 0xC5981F46…73B0Ea. The contract prices every token against this feed."
          />
        </div>
      </div>

      <Notice title="Supply, grams per token and symbol are permanent">
        Once this batch exists, those three values can never be changed — the contract has no
        function that updates them. A mistake can only be corrected by creating a new batch.
        Only the custody reference and the price feed can be updated later.
      </Notice>

      <button
        type="button"
        className="btn btn-primary btn-md"
        style={{ alignSelf: 'flex-start' }}
        disabled={!valid}
        onClick={create}
      >
        Create batch
      </button>
    </div>
  )
}

function MintBurn() {
  const { batches, operator, setWorld } = useAurum()
  const [mintId, setMintId] = useState(batches[0]?.id)
  const [mintQty, setMintQty] = useState('100')
  const [burnId, setBurnId] = useState(batches[0]?.id)
  const [burnQty, setBurnQty] = useState('10')

  const mintBatch = batches.find((b) => b.id === mintId) ?? batches[0]
  const burnBatch = batches.find((b) => b.id === burnId) ?? batches[0]
  if (!mintBatch || !burnBatch) return null

  const mintAmount = Number(mintQty || 0)
  const burnAmount = Number(burnQty || 0)
  const { headroom } = supplyOf(mintBatch)
  const overHeadroom = mintAmount > headroom
  const overInventory = burnAmount > burnBatch.inventory

  const mint = () =>
    operator({
      summary: {
        label: 'Minting',
        value: `${n(mintAmount)} tokens · ${grams(mintAmount * mintBatch.gramsPerToken)}`,
      },
      signBody: 'Aurum has asked your wallet to sign the mint.',
      completeTitle: 'Minted',
      completeBody: `${n(mintAmount)} tokens of ${mintBatch.name} are now held by the contract and available to buy.`,
      revert: overHeadroom
        ? `Only ${n(headroom)} tokens remain before this batch hits its cap, so the contract rejected the mint.`
        : null,
      execute: () => api.assets.mint(mintBatch.id, mintAmount),
      commit: () =>
        setWorld((w) => ({
          ...w,
          batches: w.batches.map((b) =>
            b.id === mintBatch.id
              ? {
                  ...b,
                  minted: b.minted + mintAmount,
                  inventory: b.inventory + mintAmount,
                  headroom: b.headroom - mintAmount,
                }
              : b,
          ),
        })),
    })

  const burn = () =>
    operator({
      summary: {
        label: 'Burning',
        value: `${n(burnAmount)} tokens · ${grams(burnAmount * burnBatch.gramsPerToken)}`,
      },
      signBody: 'Aurum has asked your wallet to sign the burn.',
      completeTitle: 'Burned',
      completeBody: `${n(burnAmount)} tokens were destroyed from the contract's own inventory. Investor balances are untouched.`,
      revert: overInventory
        ? `The contract holds ${n(burnBatch.inventory)} tokens of this batch, so the burn was rejected.`
        : null,
      execute: () => api.assets.burn(burnBatch.id, burnAmount),
      commit: () =>
        setWorld((w) => ({
          ...w,
          batches: w.batches.map((b) =>
            b.id === burnBatch.id
              ? {
                  ...b,
                  minted: b.minted - burnAmount,
                  inventory: b.inventory - burnAmount,
                  headroom: b.headroom + burnAmount,
                }
              : b,
          ),
        })),
    })

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ fontSize: 15 }}>Mint into a batch</span>
        <Select
          value={mintBatch.id}
          onChange={(event) => setMintId(Number(event.target.value))}
          aria-label="Batch to mint into"
        >
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
        <Field flagged={overHeadroom}>
          <QuantityInput aria-label="Tokens to mint" value={mintQty} onChange={setMintQty} />
          <span className="field-suffix">
            tokens · {grams(mintAmount * mintBatch.gramsPerToken)}
          </span>
        </Field>
        <span
          className="mono"
          style={{ fontSize: 12, color: overHeadroom ? 'var(--gold)' : 'var(--text-2)' }}
        >
          {n(headroom)} headroom remaining before the cap
        </span>
        <button
          type="button"
          className="btn btn-primary btn-md btn-block"
          disabled={mintAmount < 1}
          onClick={mint}
        >
          Mint {n(mintAmount)} tokens
        </button>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ fontSize: 15 }}>Burn from inventory</span>
        <Select
          value={burnBatch.id}
          onChange={(event) => setBurnId(Number(event.target.value))}
          aria-label="Batch to burn from"
        >
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
        <Field flagged={overInventory}>
          <QuantityInput aria-label="Tokens to burn" value={burnQty} onChange={setBurnQty} />
          <span className="field-suffix">
            tokens · {grams(burnAmount * burnBatch.gramsPerToken)}
          </span>
        </Field>
        <span
          className="mono"
          style={{ fontSize: 12, color: overInventory ? 'var(--gold)' : 'var(--text-2)' }}
        >
          {n(burnBatch.inventory)} held by the contract · investor tokens are untouched
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-md btn-block"
          disabled={burnAmount < 1}
          onClick={burn}
        >
          Burn {n(burnAmount)} tokens
        </button>
      </div>
    </div>
  )
}

function UpdateCustodyRef() {
  const { batches, operator, setWorld } = useAurum()
  const [batchId, setBatchId] = useState(batches[0]?.id)
  const batch = batches.find((b) => b.id === batchId) ?? batches[0]
  const [value, setValue] = useState(batch?.ref ?? '')

  if (!batch) return null

  const pick = (event) => {
    const next = Number(event.target.value)
    setBatchId(next)
    setValue(batches.find((b) => b.id === next).ref)
  }

  const update = () =>
    operator({
      summary: { label: 'Updating', value: value.trim() },
      signBody: 'Aurum has asked your wallet to sign the update.',
      completeTitle: 'Custody reference updated',
      completeBody: `${batch.name} now points at ${value.trim()}.`,
      execute: () => api.assets.setCustody(batch.id, value.trim()),
      commit: () =>
        setWorld((w) => ({
          ...w,
          batches: w.batches.map((b) =>
            b.id === batch.id ? { ...b, ref: value.trim() } : b,
          ),
        })),
    })

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}
    >
      <div style={{ flex: '1 1 240px' }}>
        <Select label="Update custody reference" value={batch.id} onChange={pick}>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <div style={{ flex: '1 1 240px' }}>
        <Field
          label="Reference"
          mono
          spellCheck="false"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-md"
        disabled={value.trim() === '' || value.trim() === batch.ref}
        onClick={update}
      >
        Update
      </button>
    </div>
  )
}

export function Batches() {
  return (
    <>
      <BatchTable />
      <CreateBatch />
      <MintBurn />
      <UpdateCustodyRef />
    </>
  )
}
