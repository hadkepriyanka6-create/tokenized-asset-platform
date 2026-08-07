import { useId } from 'react'

/**
 * A labelled control. The box is the dark inset the design puts inside every
 * card; `flagged` swaps its hairline for the notice border used whenever the
 * contract would reject what has been typed.
 */
export function Field({
  label,
  hint,
  hintTone = 'muted',
  flagged,
  suffix,
  trailing,
  mono,
  as = 'input',
  inputRef,
  children,
  ...rest
}) {
  const id = useId()
  const Tag = as

  return (
    <div className="field-stack">
      {label && (
        <label className="field-label" htmlFor={children ? undefined : id}>
          {label}
        </label>
      )}
      <div className={flagged ? 'field field-flag' : 'field'}>
        {children ?? (
          <Tag
            id={id}
            ref={inputRef}
            className={mono ? 'mono' : undefined}
            {...rest}
          />
        )}
        {suffix && <span className="field-suffix">{suffix}</span>}
        {trailing}
      </div>
      {hint && (
        <span
          className="hint"
          style={{ color: hintTone === 'gold' ? 'var(--gold)' : undefined }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}

/** A field-shaped box that only displays a value — a select, or a read-out. */
export function Readout({ label, children, hint, flagged, trailing }) {
  return (
    <div className="field-stack">
      {label && <span className="field-label">{label}</span>}
      <div className={flagged ? 'field field-flag' : 'field'}>
        {children}
        {trailing}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Select({ label, hint, trailing, children, ...rest }) {
  const id = useId()
  return (
    <div className="field-stack">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="field">
        <select id={id} {...rest}>
          {children}
        </select>
        {trailing}
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

/** Digits only, so a quantity box can never hold something un-submittable. */
export function QuantityInput({ value, onChange, max, ...rest }) {
  return (
    <input
      className="mono"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^\d]/g, '')
        if (digits === '') return onChange('')
        const parsed = Number(digits)
        return onChange(String(max != null ? Math.min(parsed, max) : parsed))
      }}
      {...rest}
    />
  )
}
