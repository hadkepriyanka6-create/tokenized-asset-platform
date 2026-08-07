import { Chrome } from '../components/Chrome'
import { Whitelist } from './admin/Whitelist'
import { Batches } from './admin/Batches'
import { Settings } from './admin/Settings'
import { Access } from './admin/Access'
import { navigate } from '../lib/router'

const TABS = [
  { key: 'whitelist', label: 'Whitelist', Panel: Whitelist },
  { key: 'batches', label: 'Batches', Panel: Batches },
  { key: 'settings', label: 'Settings', Panel: Settings },
  { key: 'access', label: 'Access', Panel: Access },
]

export function Admin({ tab }) {
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]
  const { Panel } = current

  return (
    <div className="shell">
      <Chrome active="Admin" />
      <main className="page" style={{ paddingTop: 40 }}>
        <div
          className="col"
          style={{ display: 'flex', flexDirection: 'column', gap: 28 }}
        >
          <div className="segmented" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-current={item.key === current.key}
                aria-selected={item.key === current.key}
                onClick={() => navigate(`/admin/${item.key}`)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Panel />
        </div>
      </main>
    </div>
  )
}
