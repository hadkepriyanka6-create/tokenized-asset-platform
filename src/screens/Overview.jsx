import { useAurum } from '../state/store'
import { Chrome } from '../components/Chrome'
import { Section, Stat, Empty } from '../components/Panels'
import { OverviewSkeleton } from '../components/Skeleton'
import { navigate } from '../lib/router'
import { n } from '../lib/format'

function AssetRow({ batch }) {
  return (
    <button
      type="button"
      className="row"
      onClick={() => navigate(`/asset/${batch.id}`)}
    >
      <span className="row-main">
        <span className="row-name">{batch.name}</span>
        <span className="row-ref">{batch.ref}</span>
      </span>
      <span className="metric" style={{ width: 130 }}>
        <span className="metric-value" style={{ color: 'var(--text-2)' }}>
          {batch.gramsPerToken} g
        </span>
        <span className="label">Per token</span>
      </span>
      <span className="metric" style={{ width: 150 }}>
        <span className="metric-value gold">
          {n(batch.minted)} / {n(batch.maxSupply)}
        </span>
        <span className="label">Minted / max</span>
      </span>
    </button>
  )
}

export function Overview() {
  const { batches, loading, showAdmin } = useAurum()
  const issued = batches.reduce((total, b) => total + b.minted, 0)
  const empty = batches.length === 0

  return (
    <div className="shell">
      <Chrome active="Overview" />
      <main className="page">
        <div className="col">
          {loading ? (
            <OverviewSkeleton />
          ) : (
            <div className="stack">
              <div className="grid-2">
                <Stat
                  label="Listed assets"
                  value={n(batches.length)}
                  tone={empty ? 'empty' : undefined}
                />
                <Stat
                  label="Total tokens issued"
                  value={n(issued)}
                  tone={empty ? 'empty' : undefined}
                />
              </div>

              <Section label="Assets">
                {empty ? (
                  <Empty
                    action={
                      showAdmin ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-md"
                          onClick={() => navigate('/admin/batches')}
                        >
                          Create the first batch
                        </button>
                      ) : null
                    }
                  >
                    No batches have been created yet. Once the issuer creates
                    one, it appears here.
                  </Empty>
                ) : (
                  <div className="rows">
                    {batches.map((batch) => (
                      <AssetRow key={batch.id} batch={batch} />
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
