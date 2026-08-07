/**
 * The slice of CommodityToken the browser needs.
 *
 * Only holder-signed calls live here — purchase, sell and transfer are
 * `onlyWhitelisted(msg.sender)`, so they must be signed by the investor's own
 * wallet. Issuer, compliance and admin functions are never called from the
 * browser; the server wallet holds those roles and the API signs them.
 *
 * The error fragments are included so ethers decodes a revert into a named
 * custom error rather than an opaque selector — that name is what the
 * interface turns into a plain-language message.
 */
export const AURUM_ABI = [
  // reads
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function isWhitelisted(address account) view returns (bool)",
  "function tokenPriceInWei(uint256 id) view returns (uint256)",
  "function royaltyFeeBps() view returns (uint256)",
  "function paused() view returns (bool)",
  "function nextBatchId() view returns (uint256)",
  "function getBatchDetails(uint256 id) view returns (uint256 maxSupply, uint256 mintedSupply, uint256 gramsPerToken, string assetSymbol, address priceFeed, string custodyReference, bool exists)",

  // holder-signed writes
  "function purchase(uint256 id, uint256 amount) payable",
  "function sell(uint256 id, uint256 amount, uint256 minPayoutWei)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",

  // events
  "event BatchPurchased(uint256 indexed id, address indexed buyer, uint256 amount, uint256 costWei, uint256 feeWei)",
  "event BatchSold(uint256 indexed id, address indexed seller, uint256 amount, uint256 payoutWei, uint256 feeWei)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",

  // custom errors
  "error AddressNotWhiteListed(address account)",
  "error TransferNotAllowed(address from, address to)",
  "error StaleOraclePrice()",
  "error InvalidOracleAnswer()",
  "error EnforcedPause()",
  "error AmountMustBeGreaterThanZero()",
  "error InsufficientTokensInContract(uint256 requested, uint256 held)",
  "error InsufficientPayment(uint256 required, uint256 provided)",
  "error InsufficientContractBalance()",
  "error PayoutBelowMinimum(uint256 payout, uint256 minimum)",
  "error BatchDoesNotExist(uint256 id)",
  "error RefundTransferFailed()",
  "error SellTransferFailed()",
  "error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)",
]

/** The only network Aurum is deployed to. */
export const SEPOLIA = {
  chainId: 11155111,
  hexChainId: "0xaa36a7",
  name: "Ethereum Sepolia",
  explorer: "https://sepolia.etherscan.io",
  params: {
    chainId: "0xaa36a7",
    chainName: "Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
}

/** Contract reverts, in the language the interface shows a holder. */
const REVERTS = {
  AddressNotWhiteListed: () => "This address isn't approved to receive tokens.",
  TransferNotAllowed: () =>
    "Aurum only allows transfers between approved addresses, so the contract rejected this one.",
  StaleOraclePrice: () =>
    "The gold price hasn't updated recently. Trading is paused until it does.",
  InvalidOracleAnswer: () =>
    "The price feed returned an invalid answer, so trading is unavailable.",
  EnforcedPause: () => "Aurum is paused. Transfers and trading are unavailable.",
  AmountMustBeGreaterThanZero: () => "Enter an amount greater than zero.",
  InsufficientTokensInContract: (args) =>
    `Only ${args?.[1] ?? 0} tokens are available in this batch.`,
  InsufficientPayment: () => "Not enough ETH was sent to cover the total.",
  InsufficientContractBalance: () =>
    "Aurum doesn't hold enough ETH to pay this out right now.",
  PayoutBelowMinimum: () =>
    "The price moved and the payout fell below your minimum, so nothing was sold.",
  BatchDoesNotExist: () => "That batch doesn't exist.",
  ERC1155InsufficientBalance: () => "You don't hold that many tokens.",
}

/** Turns an ethers error into something a holder can act on. */
export function describeRevert(error) {
  const name = error?.revert?.name
  if (name && REVERTS[name]) return REVERTS[name](error.revert.args)
  if (name) return `The contract rejected this: ${name}.`

  const code = error?.code
  if (code === "ACTION_REJECTED") return "You rejected the request in your wallet."
  if (code === "INSUFFICIENT_FUNDS")
    return "Your wallet doesn't have enough Sepolia ETH to cover this and gas."
  if (code === "NETWORK_ERROR") return "Lost connection to the network. Try again."

  return error?.shortMessage || error?.message || "The transaction failed."
}
