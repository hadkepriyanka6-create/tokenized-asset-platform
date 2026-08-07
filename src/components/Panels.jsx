/** The recurring surfaces: labelled sections, stat tiles, notices, ledger lines. */

export function Section({ label, action, children }) {
  return (
    <section className="section">
      {(label || action) && (
        <div className="split">
          <span className="label">{label}</span>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, tone, caption }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span
        className="num-lg"
        style={{
          color:
            tone === 'gold'
              ? 'var(--gold)'
              : tone === 'empty'
                ? 'var(--muted)'
                : undefined,
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{caption}</span>
      )}
    </div>
  )
}

/** Gold-on-brown panel — blocked transfers, pauses, stale prices, warnings. */
export function Notice({ title, children, style }) {
  return (
    <div className="notice" style={style}>
      <div className="notice-head">
        <span className="bullet" />
        <span>{title}</span>
      </div>
      {children && <p className="notice-body">{children}</p>}
    </div>
  )
}

/** The same panel without the bullet, used where it sits as a page-level block. */
export function NoticeBlock({ title, children }) {
  return (
    <div className="notice" style={{ padding: '16px 18px' }}>
      <span style={{ fontSize: 13.5, color: 'var(--gold)' }}>{title}</span>
      <p
        className="notice-body"
        style={{ paddingLeft: 0, fontSize: 13, lineHeight: 1.55 }}
      >
        {children}
      </p>
    </div>
  )
}

export function Line({ label, value, tone, size }) {
  return (
    <div className="line">
      <span style={{ color: tone === 'strong' ? 'var(--text)' : undefined }}>
        {label}
      </span>
      <span
        className="line-value"
        style={{
          color: tone === 'gold' ? 'var(--gold)' : undefined,
          fontSize: size === 'lg' ? 15 : undefined,
        }}
      >
        {value}
      </span>
    </div>
  )
}

/** A plain-text right-hand value, for rows whose value isn't a number. */
export function TextLine({ label, value }) {
  return (
    <div className="line">
      <span>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

export function Empty({ children, action }) {
  return (
    <div className="empty">
      <p style={{ fontSize: 14, color: 'var(--text-2)' }}>{children}</p>
      {action}
    </div>
  )
}
