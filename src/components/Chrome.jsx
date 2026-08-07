import { useAurum } from '../state/store'
import { ThemeToggle } from './ThemeToggle'
import { navigate } from '../lib/router'
import { age, dec, short, usd } from '../lib/format'

const TABS = [
  { label: 'Overview', to: '/' },
  { label: 'Portfolio', to: '/portfolio' },
  { label: 'Transfer', to: '/transfer' },
]

export function PausedBanner() {
  return (
    <div className="banner">
      <div className="col banner-inner">
        <span className="bullet-sm" />
        <span>Aurum is paused. Transfers and trading are unavailable.</span>
      </div>
    </div>
  )
}

export function Wordmark({ size = 'md' }) {
  return (
    <a href="#/" className="brand" style={{ color: 'inherit' }} aria-label="Aurum home">
      <span className={size === 'sm' ? 'mark-sm' : 'mark'} />
      <span className="wordmark" style={{ fontSize: size === 'sm' ? 17 : 19 }}>
        Aurum
      </span>
    </a>
  )
}

/**
 * The live gold price, read from the same Chainlink feed the contract prices
 * against — so what the strip shows is what a purchase will be charged at.
 */
function PriceStrip() {
  const { batches, status } = useAurum()

  const reference = batches.find((batch) => batch.feed?.price) ?? batches[0]
  if (!reference?.feed) return <span />

  const { feed } = reference
  const perGramEth =
    reference.priceEth != null && reference.gramsPerToken
      ? reference.priceEth / reference.gramsPerToken
      : null
  const minutes = Math.round((feed.ageSeconds ?? 0) / 60)

  return (
    <div className="ticker">
      <span>Gold</span>
      <span className="mono" style={{ color: 'var(--text)' }}>
        {usd(feed.price, 2)}/oz
      </span>
      {perGramEth != null && (
        <>
          <span className="dot">·</span>
          <span>1 g</span>
          <span className="mono gold">{dec(perGramEth, 5)} ETH</span>
        </>
      )}
      <span className="dot">·</span>
      <span style={{ color: feed.stale ? 'var(--gold)' : 'var(--muted)' }}>
        {feed.stale ? `no update in ${age(minutes)}` : `updated ${age(minutes)} ago`}
      </span>
      {status?.ethUsd?.price && (
        <>
          <span className="dot">·</span>
          <span className="mono" style={{ color: 'var(--muted)' }}>
            ETH {usd(status.ethUsd.price, 2)}
          </span>
        </>
      )}
    </div>
  )
}

export function Chrome({ active }) {
  const { user, account, paused, showAdmin, role, signOut, demoMode } = useAurum()
  const tabs = showAdmin ? [...TABS, { label: 'Admin', to: '/admin' }] : TABS

  return (
    <header>
      {paused && <PausedBanner />}

      <div className="masthead">
        <div className="col masthead-inner">
          <div className="brand">
            <Wordmark />
            <span className="chip">{role}</span>
            {demoMode && <span className="chip">Demo</span>}
          </div>
          <div className="account">
            <span className="name" style={{ fontSize: 13 }}>
              {user?.fullName}
            </span>
            {account && (
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {short(account)}
              </span>
            )}
            <span className="avatar" />
            <button
              type="button"
              className="btn-quiet logout"
              style={{ fontSize: 13 }}
              onClick={() => {
                signOut()
                navigate('/')
              }}
            >
              Log out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <nav className="tabbar">
        <div className="col tabbar-inner">
          <div className="tabs">
            {tabs.map((tab) => (
              <a
                key={tab.label}
                href={`#${tab.to}`}
                className="tab"
                aria-current={tab.label === active ? 'page' : undefined}
              >
                {tab.label}
              </a>
            ))}
          </div>
          <PriceStrip />
        </div>
      </nav>
    </header>
  )
}

/** The public masthead the custody page uses before anyone signs in. */
export function MarketingChrome({ active }) {
  return (
    <header className="masthead">
      <div className="col masthead-inner">
        <Wordmark />
        <div className="marketing-nav">
          <a
            href="#/"
            style={{ fontSize: 13, color: active === 'Overview' ? 'var(--text)' : 'var(--text-2)' }}
          >
            Overview
          </a>
          <a
            href="#/custody"
            style={{ fontSize: 13, color: active === 'Custody' ? 'var(--text)' : 'var(--text-2)' }}
          >
            Custody
          </a>
          <a href="#/" className="btn btn-secondary btn-sm">
            Sign in
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
