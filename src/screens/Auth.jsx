import { useState } from 'react'
import { useAurum } from '../state/store'
import { Wordmark } from '../components/Chrome'
import { ThemeToggle } from '../components/ThemeToggle'
import { Field } from '../components/Fields'
import { Notice } from '../components/Panels'

// Mirrors the policy the API enforces, so the rule is visible before submit
// rather than arriving as a 400.
const POLICY = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

const RULES = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v) => /\d/.test(v) },
  { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

export function Auth() {
  const { signIn, signUp } = useAurum()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  const registering = tab === 'register'
  const passwordOk = POLICY.test(form.password)
  const ready =
    form.email.includes('@') &&
    form.password.length > 0 &&
    (!registering || (form.fullName.trim() && passwordOk))

  const submit = async (event) => {
    event.preventDefault()
    if (!ready || busy) return

    setBusy(true)
    setError(null)
    try {
      if (registering) {
        await signUp({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
        })
      } else {
        await signIn({ email: form.email.trim(), password: form.password })
      }
    } catch (problem) {
      setError(problem.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="col masthead-inner">
          <Wordmark />
          <ThemeToggle />
        </div>
      </header>

      <div className="centered">
        <form
          onSubmit={submit}
          style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
            <span className="mark-lg" style={{ alignSelf: 'center' }} />
            <h1 className="title" style={{ marginTop: 8 }}>
              {registering ? 'Create an account' : 'Sign in'}
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)' }}>
              Tokenized gold, held in custody and moved on-chain between approved holders.
            </p>
          </div>

          <div className="segmented" style={{ alignSelf: 'center' }}>
            <button type="button" aria-current={tab === 'login'} onClick={() => setTab('login')}>
              Sign in
            </button>
            <button
              type="button"
              aria-current={registering}
              onClick={() => setTab('register')}
            >
              Register
            </button>
          </div>

          <div
            className="card card-roomy"
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            {registering && (
              <Field
                label="Full name"
                autoComplete="name"
                value={form.fullName}
                onChange={set('fullName')}
              />
            )}

            <Field
              label="Email"
              type="email"
              autoComplete="email"
              spellCheck="false"
              value={form.email}
              onChange={set('email')}
            />

            <Field
              label="Password"
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={set('password')}
            />

            {registering && form.password.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {RULES.map((rule) => {
                  const met = rule.test(form.password)
                  return (
                    <span
                      key={rule.label}
                      style={{
                        fontSize: 12,
                        color: met ? 'var(--gold)' : 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: met ? 'var(--gold)' : 'var(--rule)',
                        }}
                      />
                      {rule.label}
                    </span>
                  )
                })}
              </div>
            )}

            {error && <Notice title={error} />}

            <button type="submit" className="btn btn-primary btn-block" disabled={!ready || busy}>
              {busy ? 'Working…' : registering ? 'Create account' : 'Sign in'}
            </button>
          </div>

          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
            New accounts start as investors and hold nothing until compliance approves the
            wallet you connect. <a href="#/custody">Read how custody works</a>.
          </p>
        </form>
      </div>
    </div>
  )
}
