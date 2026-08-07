import { Chrome } from '../components/Chrome'
import { Section } from '../components/Panels'
import { CONTRACT_ERRORS } from '../state/demo'

/**
 * Every revert the contract can produce, in the language a holder sees it in —
 * the same copy `services/chain.js` and `lib/abi.js` map custom errors to.
 */
export function Errors() {
  return (
    <div className="shell">
      <Chrome active="Overview" />
      <main className="page">
        <div className="col" style={{ maxWidth: 688 }}>
          <Section label="Contract errors in plain language">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CONTRACT_ERRORS.map((error) => (
                <div
                  className="notice"
                  key={error.code}
                  style={{ padding: '13px 15px', gap: 5 }}
                >
                  <div className="notice-head">
                    <span className="bullet" />
                    <span>{error.message}</span>
                  </div>
                  <span
                    className="mono"
                    style={{ fontSize: 11.5, color: 'var(--muted)', paddingLeft: 15 }}
                  >
                    {error.code}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </main>
    </div>
  )
}
