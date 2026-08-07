const group = new Intl.NumberFormat('en-US')

export const n = (value) => group.format(value)

export const grams = (value) => `${group.format(Math.round(value))} g`

export const kg = (value) =>
  `${(value / 1000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kg`

export const dec = (value, places) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })

export const eth = (value, places = 5) => `${dec(value, places)} ETH`

export const usd = (value, places = 0) =>
  `$${value.toLocaleString('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })}`

export const pct = (value) => `${dec(value, 2)}%`

/** 0x8F3a94C7…21D7 → 0x8F3a…21D7, the form used everywhere but the ledgers. */
export const short = (address) =>
  address && address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address

export const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(value.trim())

export const sameAddress = (a, b) =>
  Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase()

/** "4 h 12 min" / "14 min" — how the price strip reports feed age. */
export const age = (minutes) => {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export const date = (value) =>
  value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
