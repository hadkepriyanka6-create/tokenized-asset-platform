/**
 * Pricing mirrors the contract:
 *
 *   tokenPriceInWei = XAU/USD ÷ 31.1034768 × gramsPerToken ÷ ETH/USD
 *
 * In live mode the quote is whatever `tokenPriceInWei(id)` returned, so the
 * interface never shows a number the contract wouldn't charge. The helpers
 * below only apply the fee and the slippage floor on top of it.
 */

export const TROY_OUNCE_GRAMS = 31.1034768

export const feeOn = (amount, bps) => (amount * bps) / 10000

export const buyQuote = (priceEth, qty, feeBps) => {
  const subtotal = priceEth * qty
  const fee = feeOn(subtotal, feeBps)
  return { unit: priceEth, subtotal, fee, total: subtotal + fee }
}

export const sellQuote = (priceEth, qty, feeBps) => {
  const gross = priceEth * qty
  const fee = feeOn(gross, feeBps)
  const net = gross - fee
  // The contract reverts if the live payout drops under this.
  return { unit: priceEth, gross, fee, net, floor: net * 0.99 }
}

/**
 * Minted splits into tokens investors hold and tokens the contract still holds
 * for sale; the remainder to the cap is unminted headroom.
 */
export const supplyOf = (batch) => {
  const circulating = batch.minted - batch.inventory
  const max = batch.maxSupply || 1
  return {
    circulating,
    headroom: batch.maxSupply - batch.minted,
    circulatingPct: (circulating / max) * 100,
    inventoryPct: (batch.inventory / max) * 100,
  }
}

/** Gold weight → ETH, using the same per-gram figure the batch price implies. */
export const gramsToEth = (grams, batch) =>
  batch && batch.gramsPerToken ? (grams / batch.gramsPerToken) * (batch.priceEth ?? 0) : 0
