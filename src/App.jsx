import { useEffect } from 'react'
import { AurumProvider, useAurum } from './state/store'
import { navigate, useRoute } from './lib/router'
import { TxModal } from './components/TxModal'
import { StatusPanel } from './components/DevPanel'
import { Auth } from './screens/Auth'
import { Connect, NotApproved, WrongNetwork } from './screens/Entry'
import { Overview } from './screens/Overview'
import { AssetDetail } from './screens/AssetDetail'
import { Portfolio } from './screens/Portfolio'
import { Transfer } from './screens/Transfer'
import { Admin } from './screens/Admin'
import { Custody } from './screens/Custody'
import { Errors } from './screens/Patterns'

function Redirect({ to, children }) {
  useEffect(() => navigate(to), [to])
  return children
}

function Booting() {
  return (
    <div className="shell">
      <div className="centered">
        <div className="entry">
          <span className="mark-lg" />
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Connecting to Aurum…</span>
        </div>
      </div>
    </div>
  )
}

function Routes() {
  const { booted, user, linked, onWrongNetwork, whitelisted, showAdmin } = useAurum()
  const { segments, params } = useRoute()
  const [first, second] = segments

  if (!booted) return <Booting />

  // Custody is public — readable before anyone signs in.
  if (first === 'custody') return <Custody />

  // Sign in, then attach a wallet, then pass the compliance gate.
  if (!user) return <Auth />
  if (onWrongNetwork) return <WrongNetwork />
  if (!linked) return <Connect />
  if (!whitelisted) return <NotApproved />

  switch (first) {
    case undefined:
      return <Overview />

    case 'asset':
      return <AssetDetail batchId={Number(second)} />

    case 'portfolio':
      return <Portfolio />

    case 'transfer': {
      const preselected = params.get('batch')
      return (
        <Transfer
          key={preselected ?? 'any'}
          preselected={preselected ? Number(preselected) : null}
        />
      )
    }

    case 'admin':
      if (!showAdmin) {
        return (
          <Redirect to="/">
            <Overview />
          </Redirect>
        )
      }
      return <Admin tab={second} />

    case 'errors':
      return <Errors />

    default:
      return <Overview />
  }
}

export default function App() {
  return (
    <AurumProvider>
      <Routes />
      <TxModal />
      <StatusPanel />
    </AurumProvider>
  )
}
