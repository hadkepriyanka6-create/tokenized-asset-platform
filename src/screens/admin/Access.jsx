import { useCallback, useEffect, useState } from 'react'
import { useAurum } from '../../state/store'
import { Section, Notice } from '../../components/Panels'
import { Field, Select } from '../../components/Fields'
import { api } from '../../lib/api'
import { isAddress, short } from '../../lib/format'

const DESCRIPTIONS = {
  DEFAULT_ADMIN_ROLE: 'Manages roles, fees, the treasury and the reserve',
  COMPLIANCE_ROLE: 'Adds and removes approved addresses',
  ISSUER_ROLE: 'Creates batches, mints and burns',
  PAUSER_ROLE: 'Freezes and resumes the contract',
}

const LABELS = {
  DEFAULT_ADMIN_ROLE: 'Admin',
  COMPLIANCE_ROLE: 'Compliance',
  ISSUER_ROLE: 'Issuer',
  PAUSER_ROLE: 'Pauser',
}

const COLUMNS = '170px 1fr 220px 90px'

function Roles() {
  const { demoMode, world, status, operator, setWorld } = useAurum()
  const [roles, setRoles] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (demoMode) {
      setRoles(
        world.roles.map((role) => ({
          name: role.name,
          label: role.name,
          can: role.can,
          holder: role.holder,
        })),
      )
      return
    }
    try {
      const live = await api.admin.roles()
      setRoles(
        live.map((role) => ({
          name: role.name,
          label: LABELS[role.name] ?? role.name,
          can: DESCRIPTIONS[role.name] ?? '',
          holder: role.operatorHolds ? status?.operator : null,
        })),
      )
      setError(null)
    } catch (problem) {
      setError(problem.message)
    }
  }, [demoMode, world, status])

  useEffect(() => {
    load()
  }, [load])

  const revoke = (role) =>
    operator({
      summary: { label: 'Revoking', value: role.label },
      signBody: 'Aurum has asked your wallet to sign the revocation.',
      completeTitle: 'Role revoked',
      completeBody: `${short(role.holder)} no longer holds ${role.label}.`,
      execute: () => api.admin.revokeRole(role.name, role.holder),
      commit: () =>
        setWorld((w) => ({
          ...w,
          roles: w.roles.map((r) => (r.name === role.name ? { ...r, holder: null } : r)),
        })),
      onDone: load,
    })

  return (
    <Section label="Roles">
      {error && <Notice title="Couldn't read the roles">{error}</Notice>}

      <div className="card-flush">
        {roles.map((role) => (
          <div
            className="ledger"
            key={role.name}
            style={{ gridTemplateColumns: COLUMNS, padding: '16px 20px' }}
          >
            <span className="ledger-cell" style={{ fontSize: 14 }}>
              {role.label}
            </span>
            <span className="ledger-cell" style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {role.can}
            </span>
            <span
              className="ledger-cell mono"
              data-label="Operator"
              style={{ fontSize: 13, textAlign: 'right' }}
            >
              {role.holder ? (
                short(role.holder)
              ) : (
                <span style={{ color: 'var(--muted)' }}>Operator doesn't hold it</span>
              )}
            </span>
            <span style={{ textAlign: 'right' }}>
              {role.holder && (
                <button
                  type="button"
                  className="btn-quiet"
                  style={{ fontSize: 13 }}
                  onClick={() => revoke(role)}
                >
                  Revoke
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {!demoMode && (
        <span className="hint">
          AccessControl doesn't enumerate members on-chain, so this shows whether Aurum's own
          operator wallet holds each role. Grants to other addresses are still recorded in the
          contract's RoleGranted events.
        </span>
      )}
    </Section>
  )
}

function GrantRole() {
  const { operator, setWorld, demoMode } = useAurum()
  const [name, setName] = useState('COMPLIANCE_ROLE')
  const [address, setAddress] = useState('')

  const trimmed = address.trim()
  const malformed = trimmed !== '' && !isAddress(trimmed)
  const label = LABELS[name] ?? name

  const grant = () =>
    operator({
      summary: { label: 'Granting', value: `${label} · ${short(trimmed)}` },
      signBody: 'Aurum has asked your wallet to sign the grant.',
      completeTitle: 'Role granted',
      completeBody: `${short(trimmed)} now holds ${label}.`,
      execute: () => api.admin.grantRole(name, trimmed),
      commit: () =>
        setWorld((w) => ({
          ...w,
          roles: w.roles.map((r) => (r.name === label ? { ...r, holder: trimmed } : r)),
        })),
      onDone: () => setAddress(''),
    })

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}
    >
      <div style={{ flex: '0 1 200px' }}>
        <Select label="Role" value={name} onChange={(event) => setName(event.target.value)}>
          {(demoMode
            ? ['Admin', 'Compliance', 'Issuer', 'Pauser']
            : Object.keys(LABELS)
          ).map((key) => (
            <option key={key} value={key}>
              {LABELS[key] ?? key}
            </option>
          ))}
        </Select>
      </div>
      <div style={{ flex: '1 1 240px' }}>
        <Field
          label="Address"
          mono
          spellCheck="false"
          placeholder="0x…"
          flagged={malformed}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary btn-md"
        disabled={!isAddress(trimmed)}
        onClick={grant}
      >
        Grant role
      </button>
    </div>
  )
}

function PauseControl() {
  const { paused, operator, setWorld } = useAurum()

  const toggle = () =>
    operator({
      summary: { label: paused ? 'Resuming' : 'Pausing', value: 'Aurum · all functions' },
      signBody: paused
        ? 'Aurum has asked your wallet to sign the resume.'
        : 'Aurum has asked your wallet to sign the pause.',
      completeTitle: paused ? 'Contract resumed' : 'Contract paused',
      completeBody: paused
        ? 'Minting, trading and transfers are available again.'
        : 'Minting, trading and transfers are stopped. Balances are unaffected — nothing is lost.',
      execute: () => (paused ? api.admin.unpause() : api.admin.pause()),
      commit: () => setWorld((w) => ({ ...w, paused: !paused })),
    })

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 32,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="bullet" />
          <span style={{ fontSize: 15 }}>
            {paused ? 'Contract is paused' : 'Contract is live'}
          </span>
        </div>
        <p
          style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)', maxWidth: 620 }}
        >
          {paused
            ? 'No holder can move tokens while the contract is paused. Balances are unaffected and nothing is lost — resuming restores minting, trading and transfers immediately.'
            : 'Pausing stops all minting, trading and transfers immediately. Balances are unaffected and nothing is lost — but no holder can move tokens until it is unpaused.'}
        </p>
      </div>
      <button
        type="button"
        className={paused ? 'btn btn-secondary btn-md' : 'btn btn-caution btn-md'}
        style={{ flex: 'none' }}
        onClick={toggle}
      >
        {paused ? 'Resume contract' : 'Pause contract'}
      </button>
    </div>
  )
}

export function Access() {
  return (
    <>
      <Roles />
      <GrantRole />
      <PauseControl />
    </>
  )
}
