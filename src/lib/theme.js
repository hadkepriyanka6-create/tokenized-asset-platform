import { useSyncExternalStore } from 'react'

/**
 * Theme, as a tiny external store.
 *
 * Three states, not two:
 *   'light' | 'dark'  an explicit choice, remembered
 *   null              follow the operating system, and keep following it
 *
 * The store lives at module scope rather than in a component so every toggle
 * on screen reads the same value — `useSyncExternalStore` is React's built-in
 * way to subscribe to state that lives outside React, which is exactly what
 * localStorage and `matchMedia` are.
 */

const KEY = 'aurum.theme'
const LIGHT_BG = '#fbfaf8'
const DARK_BG = '#0a0a0b'

const canUseDom = typeof window !== 'undefined' && typeof document !== 'undefined'

const listeners = new Set()
const emit = () => listeners.forEach((notify) => notify())

function read() {
  if (!canUseDom) return null
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    // Private browsing can throw on localStorage access.
    return null
  }
}

let choice = read()

const query = () =>
  canUseDom && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null

export const systemTheme = () => (query()?.matches ? 'light' : 'dark')

/** What is actually on screen: the explicit choice, or the system's. */
export const resolveTheme = () => choice ?? systemTheme()

/**
 * Writes the choice to the document. `data-theme` drives the CSS; removing it
 * hands control back to the prefers-color-scheme media query.
 */
function apply() {
  if (!canUseDom) return

  const root = document.documentElement
  if (choice) root.setAttribute('data-theme', choice)
  else root.removeAttribute('data-theme')

  // Keeps the mobile browser's address bar in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolveTheme() === 'light' ? LIGHT_BG : DARK_BG)
}

export function setTheme(next) {
  choice = next === 'light' || next === 'dark' ? next : null

  try {
    if (choice) localStorage.setItem(KEY, choice)
    else localStorage.removeItem(KEY)
  } catch {
    // Preference just won't persist; the session still works.
  }

  apply()
  emit()
}

export const toggleTheme = () => setTheme(resolveTheme() === 'dark' ? 'light' : 'dark')

// Follow the OS live, but only while no explicit choice is stored.
if (canUseDom) {
  apply()
  const mq = query()
  mq?.addEventListener?.('change', () => {
    if (choice === null) {
      apply()
      emit()
    }
  })
}

const subscribe = (notify) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, resolveTheme, () => 'dark')
  const preference = useSyncExternalStore(subscribe, () => choice, () => null)

  return {
    theme, // 'light' | 'dark' — what is rendered
    preference, // 'light' | 'dark' | null — what was chosen
    followsSystem: preference === null,
    setTheme,
    toggleTheme,
  }
}
