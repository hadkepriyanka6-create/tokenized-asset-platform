import { Section } from './Panels'

const WIDTHS = ['260px', '310px', '230px', '290px']

/** Loading is skeleton rows in the shape of the content — never a spinner. */
export function OverviewSkeleton() {
  return (
    <div className="stack">
      <div className="grid-2">
        {[
          { label: 88, value: 120 },
          { label: 126, value: 150 },
        ].map((tile, i) => (
          <div className="stat" key={i} style={{ gap: 14 }}>
            <div className="sk" style={{ width: tile.label, height: 9 }} />
            <div
              className="sk"
              style={{ width: tile.value, height: 26, borderRadius: 5 }}
            />
          </div>
        ))}
      </div>

      <Section label="Assets">
        <div className="rows">
          {WIDTHS.map((width) => (
            <div className="row" key={width}>
              <div className="row-main" style={{ gap: 9 }}>
                <div className="sk" style={{ width, height: 11, maxWidth: '70%' }} />
                <div
                  className="sk sk-dim"
                  style={{ width: 170, height: 9, maxWidth: '45%' }}
                />
              </div>
              <div className="sk" style={{ width: 64, height: 11, flex: 'none' }} />
              <div className="sk" style={{ width: 104, height: 11, flex: 'none' }} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
