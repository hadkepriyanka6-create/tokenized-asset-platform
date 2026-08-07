import { useEffect, useRef } from 'react'

export function Modal({ onClose, width = 'md', flagged, labelledBy, children }) {
  const panel = useRef(null)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={[
          'modal',
          width === 'narrow' ? 'modal-narrow' : '',
          flagged ? 'modal-flagged' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ outline: 'none' }}
      >
        {children}
      </div>
    </div>
  )
}
