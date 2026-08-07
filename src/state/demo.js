/**
 * Demo mode — the state the screens were designed against.
 *
 * It runs when the API can't be reached, so the interface is still walkable
 * without a server, a database or a funded wallet. Every figure here derives
 * from the same formula the contract uses; nothing is hard-coded past the two
 * feed prices.
 */

import { TROY_OUNCE_GRAMS } from '../lib/pricing'

export const DEMO_FEED = {
  xauUsd: 3412.8,
  ethUsd: 3150.0,
  freshMinutes: 14,
  staleMinutes: 252,
}

export const usdPerGram = DEMO_FEED.xauUsd / TROY_OUNCE_GRAMS
export const ethPerGram = usdPerGram / DEMO_FEED.ethUsd

export const DEMO_CONTRACT = '0x4E1f2b9C3a7D8E05F1b642Ac9D3E7f18B2c5A604'

export const DEMO_ACCOUNT = '0x8F3a94C7e21D5b06Fa4c9E7b32D1A05c6B9e21D7'
export const DEMO_UNAPPROVED = '0xB41d7C0e93aF52816Bb0d4e77C3a91582Ae59E22'

const batch = (id, name, ref, symbol, gramsPerToken, maxSupply, minted, inventory) => ({
  id,
  name,
  ref,
  symbol,
  gramsPerToken,
  maxSupply,
  minted,
  inventory,
  circulating: minted - inventory,
  headroom: maxSupply - minted,
  priceEth: gramsPerToken * ethPerGram,
  priceUsd: gramsPerToken * usdPerGram,
  priceWei: null,
  priceError: null,
  feed: {
    description: 'XAU / USD',
    price: DEMO_FEED.xauUsd,
    ageSeconds: DEMO_FEED.freshMinutes * 60,
    stale: false,
  },
})

export const demoBatches = () => [
  batch(1, 'Zürich Vault — 100 g Cast Bars', 'LOOMIS-ZRH-24-0117', 'AURUM-ZRH100', 10, 10000, 6400, 1240),
  batch(2, 'Singapore FreePort — 1 kg Good Delivery', 'MALCA-SGP-24-0092', 'AURUM-SGP1K', 25, 4000, 3120, 480),
  batch(3, 'London LBMA — 400 oz Good Delivery', 'BRINKS-LDN-25-0043', 'AURUM-LDN400', 50, 2400, 1860, 305),
  batch(4, 'Zürich Vault — 1 oz Sovereign Rounds', 'LOOMIS-ZRH-25-0208', 'AURUM-ZRH1OZ', 5, 5000, 940, 940),
]

/** balances[address][batchId] */
export const demoBalances = () => ({
  [DEMO_ACCOUNT]: { 1: 240, 2: 64, 3: 12 },
  '0x2C7b9E04Aa61D38f5C7290Bd41e6a83F7c19F401': { 1: 318 },
  '0x1A6f04Bc93E7d2085aC41b7E9d3F60A28c5B7E31': { 1: 900, 2: 340 },
  '0x93Cd58e0A7b41F296Dd0e3a8B47c1509fE62D08A': {},
  '0x7F42a1Db60c8E395Aa27b4f0D91e6c38B5a0C7F9': { 2: 605, 3: 240 },
  '0xE0b71cF4a8925D63Ab04e7F1a2c95D3806Ef4B27': { 1: 62 },
})

export const demoWhitelist = () => [
  { address: '0x2C7b9E04Aa61D38f5C7290Bd41e6a83F7c19F401', added: '12 Mar 2026' },
  { address: DEMO_ACCOUNT, added: '12 Mar 2026' },
  { address: '0x1A6f04Bc93E7d2085aC41b7E9d3F60A28c5B7E31', added: '04 Apr 2026' },
  { address: '0x93Cd58e0A7b41F296Dd0e3a8B47c1509fE62D08A', added: '22 Apr 2026' },
  { address: '0x7F42a1Db60c8E395Aa27b4f0D91e6c38B5a0C7F9', added: '09 Jun 2026' },
  { address: '0xE0b71cF4a8925D63Ab04e7F1a2c95D3806Ef4B27', added: '27 Jul 2026' },
]

export const demoRoles = () => [
  { name: 'Admin', can: 'Manages roles, fees and the treasury address', holder: DEMO_ACCOUNT },
  { name: 'Compliance', can: 'Adds and removes approved addresses', holder: DEMO_ACCOUNT },
  { name: 'Issuer', can: 'Creates batches, mints and burns', holder: DEMO_ACCOUNT },
  { name: 'Pauser', can: 'Freezes and resumes the contract', holder: DEMO_ACCOUNT },
]

export const demoStatus = () => ({
  configured: true,
  demo: true,
  chainId: 11155111,
  contract: DEMO_CONTRACT,
  paused: false,
  royaltyFeeBps: 250,
  maxFeeBps: 1000,
  treasury: '0x7A3f61B90eD284c5170aF3b6c8E9d24501B4c091',
  reserveWei: '412847100000000000000',
  ethUsd: {
    description: 'ETH / USD',
    price: DEMO_FEED.ethUsd,
    ageSeconds: DEMO_FEED.freshMinutes * 60,
    stale: false,
  },
})

export const demoUser = () => ({
  id: 'demo',
  fullName: 'L. Marchetti',
  email: 'demo@aurum.example',
  role: 'Admin',
  isVerified: true,
  walletAddress: DEMO_ACCOUNT,
  isWhitelisted: true,
})

/** Custodian attestation behind the reconciliation table on the custody page. */
export const ATTESTATION = { date: '31 Jul 2026', grams: 240000 }

export const CONTRACT_ERRORS = [
  { message: "This address isn't approved to receive tokens.", code: 'NotWhitelisted(address)' },
  {
    message: "The gold price hasn't updated recently. Trading is paused until it does.",
    code: 'StalePrice(uint256 updatedAt)',
  },
  {
    message: 'Only 340 tokens are available in this batch.',
    code: 'InsufficientInventory(uint256 available)',
  },
  { message: 'Aurum is paused. Transfers and trading are unavailable.', code: 'EnforcedPause()' },
]
