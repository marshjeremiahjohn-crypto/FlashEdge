export const CHAINS = [
  {
    id: "base-sepolia",
    chainId: 84532,
    chainHex: "0x14A34",
    name: "Base Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
    accent: "#007AFF",
  },
  {
    id: "arbitrum-sepolia",
    chainId: 421614,
    chainHex: "0x66eee",
    name: "Arbitrum Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
    accent: "#00FF66",
  },
  {
    id: "polygon-amoy",
    chainId: 80002,
    chainHex: "0x13882",
    name: "Polygon Amoy",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: ["https://rpc-amoy.polygon.technology"],
    blockExplorerUrls: ["https://www.oklink.com/amoy"],
    accent: "#FFB020",
  },
];

export const MAINNET_CHAINS = [
  {
    id: "base-mainnet",
    chainId: 8453,
    chainHex: "0x2105",
    name: "Base Mainnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
    accent: "#007AFF",
  },
  {
    id: "arbitrum-mainnet",
    chainId: 42161,
    chainHex: "0xa4b1",
    name: "Arbitrum One",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
    accent: "#00FF66",
  },
];

export const WALLET_CHAINS = [...MAINNET_CHAINS, ...CHAINS];

export const PROVIDERS = [
  { id: "balancer", name: "Balancer Flash Loan", fee: "9 bps", latency: "1 tx" },
  { id: "uniswap-v3", name: "Uniswap V3 Flash Swap", fee: "pool fee", latency: "1 tx" },
];

export const DEXES = [
  { id: "uniswap-v2", name: "Uniswap V2", family: "V2" },
  { id: "uniswap-v3", name: "Uniswap V3", family: "V3" },
  { id: "sushiswap", name: "SushiSwap", family: "V2" },
  { id: "curve", name: "Curve-Style", family: "Stable" },
];

export const PAIRS = ["WETH/USDC", "WBTC/USDC", "LINK/USDC", "USDC/DAI"];

export const FLASH_ARBITRAGE_ABI = [
  "function executeBalancerFlashArb(address asset,uint256 amount,uint256 minProfitWei,bytes routeData)",
  "function executeUniswapV3FlashArb(address pool,uint256 amount0,uint256 amount1,uint256 minProfitWei,bytes routeData)",
];

export const shortAddress = (address) => {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

export const chainById = (chainId) => WALLET_CHAINS.find((chain) => chain.chainId === Number(chainId));

export const strategyChainById = (chainId) => CHAINS.find((chain) => chain.chainId === Number(chainId));