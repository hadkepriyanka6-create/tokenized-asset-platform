import { BrowserProvider, Contract } from "ethers"
import { AURUM_ABI, SEPOLIA } from "./abi"

/**
 * MetaMask, wrapped.
 *
 * Aurum is permissioned at the contract level: `purchase`, `sell` and every
 * transfer are gated on `msg.sender` being whitelisted. That means the holder
 * has to sign them from their own wallet — there is no server-side path that
 * could move a holder's tokens for them, by design.
 */

export const hasWallet = () => typeof window !== "undefined" && Boolean(window.ethereum)

const provider = () => {
  if (!hasWallet()) {
    throw new Error("No Ethereum wallet found. Install MetaMask to continue.")
  }
  return new BrowserProvider(window.ethereum)
}

export async function connect() {
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" })
  if (!accounts?.length) throw new Error("No account was shared by the wallet.")
  return accounts[0]
}

/**
 * Reopens MetaMask's account picker.
 *
 * `eth_requestAccounts` only prompts the first time — after that the site has
 * standing permission and the same account comes back silently. That is fine
 * for signing in, but useless when someone needs to attach a *different*
 * wallet, so `wallet_requestPermissions` asks again explicitly.
 */
export async function selectAccount() {
  try {
    await window.ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    })
  } catch (error) {
    // 4001 = the user closed the picker without choosing.
    if (error?.code === 4001) throw new Error("No account was selected.")
    // Wallets without this method still work through the fallback below.
    if (error?.code !== -32601 && error?.code !== -32602) throw error
  }

  return connect()
}

/** The account already connected, without prompting. */
export async function currentAccount() {
  if (!hasWallet()) return null
  const accounts = await window.ethereum.request({ method: "eth_accounts" })
  return accounts?.[0] ?? null
}

export async function currentChainId() {
  if (!hasWallet()) return null
  const hex = await window.ethereum.request({ method: "eth_chainId" })
  return Number(hex)
}

/** Moves the wallet to Sepolia, adding the network if it isn't there yet. */
export async function switchToSepolia() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA.hexChainId }],
    })
  } catch (error) {
    // 4902 = the wallet doesn't know this chain yet.
    if (error?.code === 4902 || error?.data?.originalError?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [SEPOLIA.params],
      })
      return
    }
    throw error
  }
}

export async function getSigner() {
  return provider().getSigner()
}

/** Contract bound to the connected account — used for every holder action. */
export async function getContract(address) {
  return new Contract(address, AURUM_ABI, await getSigner())
}

/** Read-only handle through the wallet's provider. */
export function getReadContract(address) {
  return new Contract(address, AURUM_ABI, provider())
}

export async function getBalance(address) {
  return provider().getBalance(address)
}

/** Fires when the user switches account or network in MetaMask. */
export function watch({ onAccountsChanged, onChainChanged }) {
  if (!hasWallet()) return () => {}

  const accounts = (list) => onAccountsChanged?.(list?.[0] ?? null)
  const chain = (hex) => onChainChanged?.(Number(hex))

  window.ethereum.on("accountsChanged", accounts)
  window.ethereum.on("chainChanged", chain)

  return () => {
    window.ethereum.removeListener("accountsChanged", accounts)
    window.ethereum.removeListener("chainChanged", chain)
  }
}
