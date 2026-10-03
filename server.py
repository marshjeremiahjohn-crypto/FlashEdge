from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import hashlib
import itertools
import asyncio
import requests
import time


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection. Defaults keep local health checks and test discovery from
# crashing before deployment secrets are configured; hosted deployments should
# always set MONGO_URL and DB_NAME explicitly.
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'flash_arb_engine')]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# DeFi configuration
RPC_NETWORKS = [
    {
        "id": "base-mainnet",
        "name": "Base Mainnet",
        "chain_id": 8453,
        "env_key": "BASE_MAINNET_RPC_URL",
        "explorer_url": "https://basescan.org",
        "deployment_stage": "mainnet-discovery",
    },
    {
        "id": "base-sepolia",
        "name": "Base Sepolia",
        "chain_id": 84532,
        "env_key": "BASE_SEPOLIA_RPC_URL",
        "explorer_url": "https://sepolia.basescan.org",
        "deployment_stage": "testnet-execution",
    },
    {
        "id": "arbitrum-mainnet",
        "name": "Arbitrum One",
        "chain_id": 42161,
        "env_key": "ARBITRUM_MAINNET_RPC_URL",
        "explorer_url": "https://arbiscan.io",
        "deployment_stage": "mainnet-discovery",
    },
    {
        "id": "arbitrum-sepolia",
        "name": "Arbitrum Sepolia",
        "chain_id": 421614,
        "env_key": "ARBITRUM_SEPOLIA_RPC_URL",
        "explorer_url": "https://sepolia.arbiscan.io",
        "deployment_stage": "testnet-execution",
    },
]

SUPPORTED_CHAINS = [
    {
        "id": "base-sepolia",
        "chain_id": 84532,
        "name": "Base Sepolia",
        "native_symbol": "ETH",
        "rpc_url": "https://sepolia.base.org",
        "explorer_url": "https://sepolia.basescan.org",
        "gas_multiplier": 0.82,
    },
    {
        "id": "arbitrum-sepolia",
        "chain_id": 421614,
        "name": "Arbitrum Sepolia",
        "native_symbol": "ETH",
        "rpc_url": "https://sepolia-rollup.arbitrum.io/rpc",
        "explorer_url": "https://sepolia.arbiscan.io",
        "gas_multiplier": 0.66,
    },
    {
        "id": "polygon-amoy",
        "chain_id": 80002,
        "name": "Polygon Amoy",
        "native_symbol": "POL",
        "rpc_url": "https://rpc-amoy.polygon.technology",
        "explorer_url": "https://www.oklink.com/amoy",
        "gas_multiplier": 0.38,
    },
]

PROVIDERS = [
    {"id": "balancer", "name": "Balancer Flash Loan", "fee_bps": 9, "contract_type": "BalancerFlashArb"},
    {"id": "uniswap-v3", "name": "Uniswap V3 Flash Swap", "fee_bps": 5, "contract_type": "UniswapV3FlashArb"},
]

LIVE_CHAINS = [
    {
        "id": "base",
        "chain_id": 8453,
        "name": "Base Mainnet",
        "gecko_network": "base",
        "dexscreener_chain": "base",
        "explorer_url": "https://basescan.org",
    },
    {
        "id": "arbitrum",
        "chain_id": 42161,
        "name": "Arbitrum One",
        "gecko_network": "arbitrum",
        "dexscreener_chain": "arbitrum",
        "explorer_url": "https://arbiscan.io",
    },
]

VERIFIED_DEX_KEYWORDS = ["uniswap", "sushiswap", "camelot", "pancakeswap", "aerodrome", "curve", "balancer"]
STABLE_SYMBOLS = {"USDC", "USDT", "DAI", "USDBC", "USDE", "LUSD", "FRAX", "USD+", "CRVUSD", "GHO"}
CONTRACT_FILES = ["FlashArbitrageRouter.sol", "BalancerFlashArb.sol", "UniswapV3FlashArb.sol"]

DEXES = [
    {"id": "uniswap-v2", "name": "Uniswap V2 Compatible", "type": "constant-product", "bias_bps": 18},
    {"id": "uniswap-v3", "name": "Uniswap V3 Compatible", "type": "concentrated-liquidity", "bias_bps": 32},
    {"id": "sushiswap", "name": "SushiSwap Compatible", "type": "constant-product", "bias_bps": -6},
    {"id": "curve", "name": "Curve-Style Stable Pool", "type": "stable-swap", "bias_bps": 9},
]

PAIRS = [
    {"symbol": "WETH/USDC", "base_price": 2320.0, "volatility": 0.82, "token0": "WETH", "token1": "USDC"},
    {"symbol": "WBTC/USDC", "base_price": 94500.0, "volatility": 1.15, "token0": "WBTC", "token1": "USDC"},
    {"symbol": "LINK/USDC", "base_price": 14.2, "volatility": 1.48, "token0": "LINK", "token1": "USDC"},
    {"symbol": "USDC/DAI", "base_price": 1.0, "volatility": 0.22, "token0": "USDC", "token1": "DAI"},
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_noise(*parts: Any, scale: float = 1.0) -> float:
    raw = "|".join(str(part) for part in parts)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    value = int(digest[:8], 16) / 0xFFFFFFFF
    return (value - 0.5) * 2 * scale


def chain_by_id(chain_id: int) -> Dict[str, Any]:
    for chain in SUPPORTED_CHAINS:
        if chain["chain_id"] == chain_id:
            return chain
    raise HTTPException(status_code=400, detail="Unsupported chain selected")


def provider_by_id(provider_id: str) -> Dict[str, Any]:
    for provider in PROVIDERS:
        if provider["id"] == provider_id:
            return provider
    raise HTTPException(status_code=400, detail="Unsupported flash loan provider")


def pair_by_symbol(symbol: str) -> Dict[str, Any]:
    for pair in PAIRS:
        if pair["symbol"] == symbol:
            return pair
    raise HTTPException(status_code=400, detail="Unsupported trading pair")


def validate_address(address: Optional[str], field_name: str, required: bool = False) -> Optional[str]:
    if not address:
        if required:
            raise HTTPException(status_code=400, detail=f"{field_name} is required")
        return None
    if not address.startswith("0x") or len(address) != 42:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a valid EVM address")
    try:
        int(address[2:], 16)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be hex encoded") from exc
    return address


def selected_dex_lookup(selected_dexes: List[str]) -> Dict[str, Dict[str, Any]]:
    dex_ids = selected_dexes or [dex["id"] for dex in DEXES]
    dex_lookup = {dex["id"]: dex for dex in DEXES if dex["id"] in dex_ids}
    if len(dex_lookup) < 2:
        raise HTTPException(status_code=400, detail="Select at least two DEX routes")
    return dex_lookup


def risk_multiplier_for(profile: str) -> float:
    return {"conservative": 0.72, "balanced": 1.0, "aggressive": 1.28}.get(profile, 1.0)


def calculate_opportunity(
    request: "ScanRequest",
    chain: Dict[str, Any],
    provider: Dict[str, Any],
    pair: Dict[str, Any],
    buy: Dict[str, Any],
    sell: Dict[str, Any],
    now_bucket: str,
) -> Optional["Opportunity"]:
    noise = stable_noise(now_bucket, chain["chain_id"], provider["id"], pair["symbol"], buy["id"], sell["id"], scale=17)
    risk_multiplier = risk_multiplier_for(request.risk_profile)
    spread_bps = max(0.0, (sell["bias_bps"] - buy["bias_bps"] + noise) * pair["volatility"] * risk_multiplier)
    gross_profit = request.loan_amount * (spread_bps / 10000)
    flash_fee = request.loan_amount * (provider["fee_bps"] / 10000)
    slippage_buffer = request.loan_amount * (request.max_slippage_bps / 10000) * 0.18
    gas_cost = max(0.06, request.gas_gwei * chain["gas_multiplier"] * (0.62 + request.route_depth * 0.21))
    total_cost = flash_fee + slippage_buffer + gas_cost
    net_profit = gross_profit - total_cost
    if net_profit < request.min_profit_usd:
        return None

    roi_bps = (net_profit / request.loan_amount) * 10000
    risk_score = min(99, max(12, int(38 + request.route_depth * 9 + request.max_slippage_bps / 8 - spread_bps / 4)))
    confidence = min(96, max(35, int(91 - risk_score / 2 + min(spread_bps, 90) / 3)))
    return Opportunity(
        id=str(uuid.uuid4()),
        chain_id=chain["chain_id"],
        chain_name=chain["name"],
        provider=provider["id"],
        pair=pair["symbol"],
        buy_dex=buy["name"],
        sell_dex=sell["name"],
        spread_bps=round(spread_bps, 2),
        gross_profit_usd=round(gross_profit, 2),
        estimated_fees_usd=round(total_cost, 2),
        gas_cost_usd=round(gas_cost, 2),
        net_profit_usd=round(net_profit, 2),
        roi_bps=round(roi_bps, 2),
        confidence=confidence,
        risk_score=risk_score,
        execution_window_blocks=max(1, int(9 - risk_score / 16)),
        route=[buy["name"], provider["name"], sell["name"]],
    )


def calculate_opportunities(
    request: "ScanRequest",
    chain: Dict[str, Any],
    provider: Dict[str, Any],
    pair: Dict[str, Any],
    dex_lookup: Dict[str, Dict[str, Any]],
) -> List["Opportunity"]:
    now_bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    opportunities: List[Opportunity] = []
    for buy_id, sell_id in itertools.permutations(dex_lookup.keys(), 2):
        opportunity = calculate_opportunity(request, chain, provider, pair, dex_lookup[buy_id], dex_lookup[sell_id], now_bucket)
        if opportunity:
            opportunities.append(opportunity)
    return sorted(opportunities, key=lambda item: item.net_profit_usd, reverse=True)


def transaction_warnings(provider_id: str, contract_address: Optional[str], token_borrow: Optional[str], pool_address: Optional[str]) -> List[str]:
    warnings: List[str] = []
    if not contract_address:
        warnings.append("Deploy the provided smart contract and paste its address before sending.")
    if provider_id == "balancer" and not token_borrow:
        warnings.append("Balancer execution needs the token address to borrow.")
    if provider_id == "uniswap-v3" and not pool_address:
        warnings.append("Uniswap V3 execution needs a pool address.")
    return warnings


def validate_transaction_numbers(request: "TransactionBuildRequest") -> None:
    if not request.loan_amount_raw.isdigit() or int(request.loan_amount_raw) <= 0:
        raise HTTPException(status_code=400, detail="loan_amount_raw must be a positive integer string")
    if not request.min_profit_raw.isdigit():
        raise HTTPException(status_code=400, detail="min_profit_raw must be an integer string")
    if not request.route_data.startswith("0x"):
        raise HTTPException(status_code=400, detail="route_data must be hex encoded and start with 0x")


def transaction_function_args(provider_id: str, request: "TransactionBuildRequest", token_borrow: Optional[str], pool_address: Optional[str]) -> tuple[str, List[Any]]:
    if provider_id == "balancer":
        return "executeBalancerFlashArb", [token_borrow, request.loan_amount_raw, request.min_profit_raw, request.route_data]
    return "executeUniswapV3FlashArb", [pool_address, request.loan_amount_raw, "0", request.min_profit_raw, request.route_data]


def live_chain_by_id(chain_id: str) -> Dict[str, Any]:
    for chain in LIVE_CHAINS:
        if chain["id"] == chain_id:
            return chain
    raise HTTPException(status_code=400, detail="Unsupported live discovery chain")


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def rpc_url_for(network: Dict[str, Any]) -> Optional[str]:
    raw_url = os.environ.get(network["env_key"])
    return normalize_rpc_url(raw_url)


def normalize_rpc_url(raw_url: Optional[str]) -> Optional[str]:
    if not raw_url:
        return None
    cleaned = raw_url.strip().strip('"').strip("'")
    markers = [index for index in (cleaned.find("https://", 1), cleaned.find("http://", 1)) if index != -1]
    if not markers:
        return cleaned
    return cleaned[: min(markers)]


def rpc_provider_name(url: Optional[str]) -> str:
    if not url:
        return "not-configured"
    if "alchemy.com" in url:
        return "Alchemy"
    if "infura.io" in url:
        return "Infura"
    if "drpc" in url:
        return "dRPC"
    if "ankr" in url:
        return "Ankr"
    if "chainstack" in url:
        return "Chainstack"
    return "Custom RPC"


def env_wallets() -> Dict[str, Optional[str]]:
    owner_wallet = os.environ.get("OWNER_WALLET")
    profit_wallet = os.environ.get("PROFIT_WALLET")
    return {
        "owner_wallet": owner_wallet.lower() if owner_wallet else None,
        "profit_wallet": profit_wallet.lower() if profit_wallet else None,
    }


async def configured_wallets() -> Dict[str, Optional[str]]:
    saved = await db.wallet_roles.find_one({"id": "active"}, {"_id": 0})
    if saved:
        return {"owner_wallet": saved.get("owner_wallet"), "profit_wallet": saved.get("profit_wallet")}
    return env_wallets()


def rpc_post(url: str, method: str, params: Optional[List[Any]] = None) -> Dict[str, Any]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()
    data = response.json()
    if data.get("error"):
        raise ValueError(data["error"].get("message", "RPC error"))
    return data


async def check_rpc_network(network: Dict[str, Any]) -> Dict[str, Any]:
    url = rpc_url_for(network)
    status = {
        "id": network["id"],
        "name": network["name"],
        "expected_chain_id": network["chain_id"],
        "provider": rpc_provider_name(url),
        "configured": bool(url),
        "healthy": False,
        "chain_id_match": False,
        "latest_block": None,
        "deployment_stage": network["deployment_stage"],
        "explorer_url": network["explorer_url"],
        "error": None,
    }
    if not url:
        status["error"] = "RPC URL not configured"
        return status
    try:
        chain_response = await asyncio.to_thread(rpc_post, url, "eth_chainId")
        block_response = await asyncio.to_thread(rpc_post, url, "eth_blockNumber")
        reported_chain_id = int(chain_response["result"], 16)
        status["reported_chain_id"] = reported_chain_id
        status["chain_id_match"] = reported_chain_id == network["chain_id"]
        status["latest_block"] = int(block_response["result"], 16)
        status["healthy"] = status["chain_id_match"]
    except Exception as exc:
        status["error"] = str(exc)[:180]
    return status


def gecko_pool_url(network: str, feed: str) -> str:
    base = f"https://api.geckoterminal.com/api/v2/networks/{network}"
    return f"{base}/new_pools" if feed == "new" else f"{base}/trending_pools"


def fetch_json(url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    last_error = "unknown upstream error"
    for attempt in range(2):
        try:
            response = requests.get(url, params=params, timeout=12)
            if response.status_code == 429 and attempt == 0:
                retry_after = min(to_float(response.headers.get("Retry-After"), 1.0), 2.0)
                time.sleep(retry_after)
                continue
            if not response.ok:
                last_error = f"HTTP {response.status_code} from {url}"
                logger.warning("Live source unavailable: %s", last_error)
                return {"_warning": last_error}
            return response.json()
        except requests.RequestException as exc:
            last_error = f"{type(exc).__name__} from {url}"
            logger.warning("Live source request failed: %s", exc)
            if attempt == 0:
                time.sleep(0.5)
    return {"_warning": last_error}


async def fetch_live_json(url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return await asyncio.to_thread(fetch_json, url, params)


def token_address_from_relation(pool: Dict[str, Any], relation_key: str) -> str:
    relation = pool.get("relationships", {}).get(relation_key, {}).get("data", {}).get("id", "")
    return relation.split("_", 1)[-1] if "_" in relation else relation


def classify_live_pool(pool: Dict[str, Any], chain: Dict[str, Any], source: str) -> Dict[str, Any]:
    attrs = pool.get("attributes", {})
    relationships = pool.get("relationships", {})
    dex_id = relationships.get("dex", {}).get("data", {}).get("id", "unknown")
    pair_name = attrs.get("name", "UNKNOWN / UNKNOWN")
    symbols = [part.strip().upper() for part in pair_name.replace("-", "/").split("/")]
    created_at = attrs.get("pool_created_at")
    liquidity = to_float(attrs.get("reserve_in_usd"))
    volume_24h = to_float(attrs.get("volume_usd", {}).get("h24"))
    price_change_24h = to_float(attrs.get("price_change_percentage", {}).get("h24"))
    fdv = to_float(attrs.get("fdv_usd"))
    market_cap = to_float(attrs.get("market_cap_usd"))
    buys_24h = int(to_float(attrs.get("transactions", {}).get("h24", {}).get("buys")))
    sells_24h = int(to_float(attrs.get("transactions", {}).get("h24", {}).get("sells")))
    is_verified_dex = any(keyword in dex_id.lower() for keyword in VERIFIED_DEX_KEYWORDS)
    stable_count = sum(1 for symbol in symbols if symbol in STABLE_SYMBOLS)
    is_stable_pair = stable_count >= 1
    is_microcap = (fdv and fdv < 5_000_000) or (market_cap and market_cap < 5_000_000)
    is_new = False
    if created_at:
        try:
            created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            is_new = (datetime.now(timezone.utc) - created).total_seconds() <= 7 * 24 * 3600
        except ValueError:
            is_new = False

    price_imbalance = abs(price_change_24h)
    buy_sell_total = max(1, buys_24h + sells_24h)
    buy_sell_skew = abs(buys_24h - sells_24h) / buy_sell_total
    stable_mispricing_bps = round(min(2000, price_imbalance * 100), 2) if stable_count >= 2 else 0
    edge_score = round(
        min(99, (price_imbalance * 0.7) + (volume_24h / max(liquidity, 1) * 12) + (18 if is_new else 0) + (12 if is_microcap else 0)),
        2,
    )
    expected_profit_signal = round(max(0, min(liquidity * 0.012, (price_imbalance / 100) * min(liquidity, 25_000))), 2)
    risk_flags = []
    if not is_verified_dex:
        risk_flags.append("unverified_router_or_factory")
    if liquidity < 10_000:
        risk_flags.append("low_liquidity")
    if is_new:
        risk_flags.append("new_pool")
    if abs(price_change_24h) > 60:
        risk_flags.append("high_volatility")
    if buy_sell_skew > 0.75 and buy_sell_total >= 4:
        risk_flags.append("one_sided_flow")
    risk_flags.append("unknown_tax_or_honeypot_risk")

    return {
        "id": f"{chain['id']}:{attrs.get('address')}",
        "source": source,
        "chain_id": chain["chain_id"],
        "chain_key": chain["id"],
        "chain_name": chain["name"],
        "dex_id": dex_id,
        "dex_verified": is_verified_dex,
        "pool_address": attrs.get("address"),
        "pair_name": pair_name,
        "base_token_address": token_address_from_relation(pool, "base_token"),
        "quote_token_address": token_address_from_relation(pool, "quote_token"),
        "liquidity_usd": round(liquidity, 2),
        "volume_24h_usd": round(volume_24h, 2),
        "fdv_usd": round(fdv, 2),
        "market_cap_usd": round(market_cap, 2),
        "price_change_24h_pct": round(price_change_24h, 2),
        "stable_mispricing_bps": stable_mispricing_bps,
        "edge_score": edge_score,
        "expected_profit_signal_usd": expected_profit_signal,
        "pool_created_at": created_at,
        "is_new_pool": is_new,
        "is_stable_pair": is_stable_pair,
        "is_microcap": bool(is_microcap),
        "risk_flags": risk_flags,
        "execution_blocked": False,
        "block_reasons": [],
    }


def classify_dexscreener_pair(pair: Dict[str, Any], chain: Dict[str, Any]) -> Dict[str, Any]:
    base_token = pair.get("baseToken", {})
    quote_token = pair.get("quoteToken", {})
    base_symbol = str(base_token.get("symbol", "UNKNOWN")).upper()
    quote_symbol = str(quote_token.get("symbol", "UNKNOWN")).upper()
    dex_id = pair.get("dexId", "unknown")
    liquidity = to_float(pair.get("liquidity", {}).get("usd"))
    volume_24h = to_float(pair.get("volume", {}).get("h24"))
    price_change_24h = to_float(pair.get("priceChange", {}).get("h24"))
    fdv = to_float(pair.get("fdv"))
    market_cap = to_float(pair.get("marketCap"))
    pair_created_ms = to_float(pair.get("pairCreatedAt"))
    created_at = None
    is_new = False
    if pair_created_ms:
        created_dt = datetime.fromtimestamp(pair_created_ms / 1000, timezone.utc)
        created_at = created_dt.isoformat()
        is_new = (datetime.now(timezone.utc) - created_dt).total_seconds() <= 7 * 24 * 3600

    buys_24h = int(to_float(pair.get("txns", {}).get("h24", {}).get("buys")))
    sells_24h = int(to_float(pair.get("txns", {}).get("h24", {}).get("sells")))
    buy_sell_total = max(1, buys_24h + sells_24h)
    buy_sell_skew = abs(buys_24h - sells_24h) / buy_sell_total
    is_verified_dex = any(keyword in dex_id.lower() for keyword in VERIFIED_DEX_KEYWORDS)
    stable_count = sum(1 for symbol in [base_symbol, quote_symbol] if symbol in STABLE_SYMBOLS)
    is_microcap = (fdv and fdv < 5_000_000) or (market_cap and market_cap < 5_000_000)
    price_imbalance = abs(price_change_24h)
    stable_mispricing_bps = round(min(2000, price_imbalance * 100), 2) if stable_count >= 2 else 0
    edge_score = round(
        min(99, (price_imbalance * 0.75) + (volume_24h / max(liquidity, 1) * 14) + (18 if is_new else 0) + (12 if is_microcap else 0)),
        2,
    )
    expected_profit_signal = round(max(0, min(liquidity * 0.012, (price_imbalance / 100) * min(liquidity, 25_000))), 2)
    risk_flags = []
    if not is_verified_dex:
        risk_flags.append("unverified_router_or_factory")
    if liquidity < 10_000:
        risk_flags.append("low_liquidity")
    if is_new:
        risk_flags.append("new_pool")
    if abs(price_change_24h) > 60:
        risk_flags.append("high_volatility")
    if buy_sell_skew > 0.75 and buy_sell_total >= 4:
        risk_flags.append("one_sided_flow")
    risk_flags.append("unknown_tax_or_honeypot_risk")

    return {
        "id": f"{chain['id']}:{pair.get('pairAddress')}",
        "source": "dexscreener:latest-token-profiles",
        "chain_id": chain["chain_id"],
        "chain_key": chain["id"],
        "chain_name": chain["name"],
        "dex_id": dex_id,
        "dex_verified": is_verified_dex,
        "pool_address": pair.get("pairAddress"),
        "pair_name": f"{base_symbol} / {quote_symbol}",
        "base_token_address": base_token.get("address", ""),
        "quote_token_address": quote_token.get("address", ""),
        "liquidity_usd": round(liquidity, 2),
        "volume_24h_usd": round(volume_24h, 2),
        "fdv_usd": round(fdv, 2),
        "market_cap_usd": round(market_cap, 2),
        "price_change_24h_pct": round(price_change_24h, 2),
        "stable_mispricing_bps": stable_mispricing_bps,
        "edge_score": edge_score,
        "expected_profit_signal_usd": expected_profit_signal,
        "pool_created_at": created_at,
        "is_new_pool": is_new,
        "is_stable_pair": stable_count >= 1,
        "is_microcap": bool(is_microcap),
        "risk_flags": risk_flags,
        "execution_blocked": False,
        "block_reasons": [],
    }


async def fetch_dexscreener_obscure_pairs(chains: List[Dict[str, Any]], max_profiles_per_chain: int = 4) -> List[Dict[str, Any]]:
    profiles = await fetch_live_json("https://api.dexscreener.com/token-profiles/latest/v1")
    if not isinstance(profiles, list):
        return []

    chain_lookup = {chain["dexscreener_chain"]: chain for chain in chains}
    selected_profiles: List[Dict[str, Any]] = []
    counts = {chain_key: 0 for chain_key in chain_lookup}
    for profile in profiles:
        chain_key = profile.get("chainId")
        if chain_key not in chain_lookup or counts[chain_key] >= max_profiles_per_chain:
            continue
        selected_profiles.append(profile)
        counts[chain_key] += 1

    opportunities: List[Dict[str, Any]] = []
    for profile in selected_profiles:
        token_address = profile.get("tokenAddress")
        chain = chain_lookup.get(profile.get("chainId"))
        if not token_address or not chain:
            continue
        data = await fetch_live_json(f"https://api.dexscreener.com/latest/dex/tokens/{token_address}")
        for pair in data.get("pairs", []) or []:
            if pair.get("chainId") == chain["dexscreener_chain"]:
                opportunities.append(classify_dexscreener_pair(pair, chain))
    return opportunities


def apply_live_risk_blocks(opportunity: Dict[str, Any], request: "LiveObscureScanRequest") -> Dict[str, Any]:
    reasons = []
    flags = set(opportunity["risk_flags"])
    if request.block_unknown_tax and "unknown_tax_or_honeypot_risk" in flags:
        reasons.append("Unknown tax/honeypot risk")
    if request.require_verified_dex and not opportunity["dex_verified"]:
        reasons.append("Router/factory not verified")
    if opportunity["liquidity_usd"] < request.min_liquidity_usd:
        reasons.append("Below minimum liquidity")
    if opportunity["expected_profit_signal_usd"] < request.min_profit_usd:
        reasons.append("Below minimum profit signal")
    opportunity["execution_blocked"] = bool(reasons)
    opportunity["block_reasons"] = reasons
    return opportunity


def live_opportunity_matches(opportunity: Dict[str, Any], request: "LiveObscureScanRequest") -> bool:
    if opportunity["liquidity_usd"] < request.min_liquidity_usd or opportunity["liquidity_usd"] > request.max_liquidity_usd:
        return False
    if opportunity["volume_24h_usd"] < request.min_volume_24h_usd:
        return False
    focus_checks = []
    if request.focus_new_pools:
        focus_checks.append(opportunity["is_new_pool"])
    if request.focus_stable_mispricing:
        focus_checks.append(opportunity["is_stable_pair"])
    if request.focus_microcaps:
        focus_checks.append(opportunity["is_microcap"])
    if focus_checks and not any(focus_checks):
        return False
    return True


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class ScanRequest(BaseModel):
    chain_id: int
    provider: str
    pair: str
    loan_amount: float = Field(gt=0)
    selected_dexes: List[str] = Field(default_factory=list)
    max_slippage_bps: int = Field(default=45, ge=1, le=500)
    min_profit_usd: float = Field(default=25, ge=0)
    gas_gwei: float = Field(default=0.35, ge=0)
    route_depth: int = Field(default=2, ge=2, le=4)
    risk_profile: str = "balanced"


class Opportunity(BaseModel):
    id: str
    chain_id: int
    chain_name: str
    provider: str
    pair: str
    buy_dex: str
    sell_dex: str
    spread_bps: float
    gross_profit_usd: float
    estimated_fees_usd: float
    gas_cost_usd: float
    net_profit_usd: float
    roi_bps: float
    confidence: int
    risk_score: int
    execution_window_blocks: int
    route: List[str]
    simulated: bool = True


class ScanResponse(BaseModel):
    id: str
    created_at: str
    request: ScanRequest
    opportunities: List[Opportunity]
    best_net_profit_usd: float
    simulated: bool = True
    note: str


class StrategyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    chain_id: int
    provider: str
    pair: str
    loan_amount: float = Field(gt=0)
    selected_dexes: List[str]
    max_slippage_bps: int = Field(ge=1, le=500)
    min_profit_usd: float = Field(ge=0)
    risk_profile: str


class Strategy(BaseModel):
    id: str
    name: str
    chain_id: int
    provider: str
    pair: str
    loan_amount: float
    selected_dexes: List[str]
    max_slippage_bps: int
    min_profit_usd: float
    risk_profile: str
    created_at: str


class TransactionBuildRequest(BaseModel):
    chain_id: int
    provider: str
    pair: str
    contract_address: Optional[str] = None
    token_borrow: Optional[str] = None
    pool_address: Optional[str] = None
    loan_amount_raw: str
    min_profit_raw: str = "0"
    route_data: str = "0x"


class TransactionBuildResponse(BaseModel):
    id: str
    chain_id: int
    provider: str
    to: Optional[str]
    value: str = "0x0"
    function_name: str
    args: List[Any]
    is_ready_to_send: bool
    warnings: List[str]
    created_at: str


class ExecutionCreate(BaseModel):
    chain_id: int
    provider: str
    pair: str
    tx_hash: str
    net_profit_usd: Optional[float] = None
    status: str = "submitted"


class ExecutionRecord(BaseModel):
    id: str
    chain_id: int
    provider: str
    pair: str
    tx_hash: str
    net_profit_usd: Optional[float] = None
    status: str
    created_at: str


class RpcStatus(BaseModel):
    id: str
    name: str
    expected_chain_id: int
    provider: str
    configured: bool
    healthy: bool
    chain_id_match: bool
    latest_block: Optional[int] = None
    deployment_stage: str
    explorer_url: str
    error: Optional[str] = None
    reported_chain_id: Optional[int] = None


class WalletRolesUpdate(BaseModel):
    owner_wallet: str
    profit_wallet: str


class WalletRoles(BaseModel):
    owner_wallet: str
    profit_wallet: str
    updated_at: Optional[str] = None


class ContractDeploymentConfigCreate(BaseModel):
    network_id: str
    provider: str
    owner_wallet: str
    profit_wallet: str
    max_trade_amount_raw: str = "0"
    max_slippage_bps: int = Field(default=50, ge=1, le=200)
    min_profit_usd: float = Field(default=5, ge=0)
    gas_cap_usd: float = Field(default=7, ge=0)


class ContractDeploymentConfig(BaseModel):
    id: str
    network_id: str
    provider: str
    owner_wallet: str
    profit_wallet: str
    max_trade_amount_raw: str
    max_slippage_bps: int
    min_profit_usd: float
    gas_cap_usd: float
    created_at: str


class ContractDeploymentCreate(BaseModel):
    network_id: str
    provider: str
    contract_name: str
    contract_address: str
    constructor_args: List[str] = Field(default_factory=list)
    owner_wallet: str
    profit_wallet: str
    status: str = "deployed"
    notes: str = ""


class ContractDeployment(BaseModel):
    id: str
    network_id: str
    provider: str
    contract_name: str
    contract_address: str
    constructor_args: List[str]
    owner_wallet: str
    profit_wallet: str
    status: str
    notes: str
    explorer_url: Optional[str] = None
    created_at: str


class RouterAllowlistCreate(BaseModel):
    network_id: str
    router_address: str
    label: str = Field(min_length=2, max_length=80)
    dex_type: str = "v2-compatible"
    approved: bool = True


class RouterAllowlistRecord(BaseModel):
    id: str
    network_id: str
    router_address: str
    label: str
    dex_type: str
    approved: bool
    explorer_url: Optional[str] = None
    created_at: str


class PreflightSimulationRequest(BaseModel):
    network_id: str
    from_address: str
    to_address: str
    tx_data: str
    value: str = "0x0"


class PreflightSimulationResponse(BaseModel):
    id: str
    network_id: str
    provider: str
    rpc_healthy: bool
    contract_has_code: bool
    call_success: bool
    gas_estimate: Optional[int] = None
    warnings: List[str]
    error: Optional[str] = None
    created_at: str


class LiveObscureScanRequest(BaseModel):
    chains: List[str] = Field(default_factory=lambda: ["base", "arbitrum"])
    feed: str = Field(default="both")
    min_liquidity_usd: float = Field(default=5000, ge=0)
    max_liquidity_usd: float = Field(default=2_500_000, ge=1)
    min_volume_24h_usd: float = Field(default=500, ge=0)
    min_profit_usd: float = Field(default=25, ge=0)
    focus_new_pools: bool = True
    focus_stable_mispricing: bool = True
    focus_microcaps: bool = True
    require_verified_dex: bool = True
    block_unknown_tax: bool = True
    limit: int = Field(default=40, ge=1, le=100)


class LiveObscureOpportunity(BaseModel):
    id: str
    source: str
    chain_id: int
    chain_key: str
    chain_name: str
    dex_id: str
    dex_verified: bool
    pool_address: str
    pair_name: str
    base_token_address: str
    quote_token_address: str
    liquidity_usd: float
    volume_24h_usd: float
    fdv_usd: float
    market_cap_usd: float
    price_change_24h_pct: float
    stable_mispricing_bps: float
    edge_score: float
    expected_profit_signal_usd: float
    pool_created_at: Optional[str]
    is_new_pool: bool
    is_stable_pair: bool
    is_microcap: bool
    risk_flags: List[str]
    execution_blocked: bool
    block_reasons: List[str]


class LiveObscureScanResponse(BaseModel):
    id: str
    created_at: str
    request: LiveObscureScanRequest
    opportunities: List[LiveObscureOpportunity]
    sources: List[str]
    source_warnings: List[str] = Field(default_factory=list)
    live: bool = True
    note: str


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Flash arbitrage command API online", "mode": "testnet-first"}


@app.get("/health")
async def health():
    """Platform health probe that does not require a database round trip."""
    return {"status": "ok", "service": "flash-arb-engine-api"}


@api_router.get("/config")
async def get_config():
    return {"chains": SUPPORTED_CHAINS, "live_chains": LIVE_CHAINS, "providers": PROVIDERS, "dexes": DEXES, "pairs": PAIRS}


@api_router.get("/rpc/status", response_model=List[RpcStatus])
async def rpc_status():
    statuses = await asyncio.gather(*(check_rpc_network(network) for network in RPC_NETWORKS))
    return statuses


@api_router.get("/contracts/testnet-readiness")
async def get_contract_testnet_readiness():
    statuses = await asyncio.gather(*(check_rpc_network(network) for network in RPC_NETWORKS if network["deployment_stage"] == "testnet-execution"))
    return {
        "contracts": CONTRACT_FILES,
        "testnet_rpcs": statuses,
        "wallets": await configured_wallets(),
        "next_steps": [
            "Deploy BalancerFlashArb or UniswapV3FlashArb from your owner wallet on Base Sepolia and Arbitrum Sepolia.",
            "Approve only verified testnet routers/pools before execution.",
            "Run a fork/testnet transaction with tiny amounts before any mainnet route.",
            "Paste deployed contract addresses into the Transaction Builder once deployed.",
        ],
        "safety_defaults": {"min_profit_usd": 5, "max_slippage_bps": 50, "emergency_slippage_bps": 200, "gas_cap_usd": 7},
    }


@api_router.get("/contracts/wallet-roles", response_model=WalletRoles)
async def get_wallet_roles():
    wallets = await configured_wallets()
    return {
        "owner_wallet": wallets.get("owner_wallet") or "",
        "profit_wallet": wallets.get("profit_wallet") or "",
        "updated_at": None,
    }


@api_router.post("/contracts/wallet-roles", response_model=WalletRoles)
async def update_wallet_roles(roles: WalletRolesUpdate):
    owner = validate_address(roles.owner_wallet, "Owner wallet", required=True)
    profit = validate_address(roles.profit_wallet, "Profit wallet", required=True)
    doc = {
        "id": "active",
        "owner_wallet": owner.lower(),
        "profit_wallet": profit.lower(),
        "updated_at": utc_now_iso(),
    }
    await db.wallet_roles.update_one({"id": "active"}, {"$set": doc}, upsert=True)
    return {"owner_wallet": doc["owner_wallet"], "profit_wallet": doc["profit_wallet"], "updated_at": doc["updated_at"]}


@api_router.post("/contracts/deployment-config", response_model=ContractDeploymentConfig)
async def save_contract_deployment_config(config: ContractDeploymentConfigCreate):
    valid_networks = {network["id"] for network in RPC_NETWORKS}
    if config.network_id not in valid_networks:
        raise HTTPException(status_code=400, detail="Unsupported deployment network")
    provider_by_id(config.provider)
    validate_address(config.owner_wallet, "Owner wallet", required=True)
    validate_address(config.profit_wallet, "Profit wallet", required=True)
    if not config.max_trade_amount_raw.isdigit():
        raise HTTPException(status_code=400, detail="max_trade_amount_raw must be an integer string")
    doc = config.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = utc_now_iso()
    await db.contract_deployment_configs.insert_one(doc.copy())
    return doc


@api_router.get("/contracts/deployment-config", response_model=List[ContractDeploymentConfig])
async def list_contract_deployment_configs():
    configs = await db.contract_deployment_configs.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return configs


@api_router.post("/contracts/deployments", response_model=ContractDeployment)
async def save_contract_deployment(deployment: ContractDeploymentCreate):
    network_lookup = {network["id"]: network for network in RPC_NETWORKS}
    if deployment.network_id not in network_lookup:
        raise HTTPException(status_code=400, detail="Unsupported deployment network")
    provider_by_id(deployment.provider)
    if deployment.contract_name not in {"BalancerFlashArb", "UniswapV3FlashArb"}:
        raise HTTPException(status_code=400, detail="Unsupported contract name")
    validate_address(deployment.contract_address, "Contract address", required=True)
    validate_address(deployment.owner_wallet, "Owner wallet", required=True)
    validate_address(deployment.profit_wallet, "Profit wallet", required=True)
    doc = deployment.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = utc_now_iso()
    doc["explorer_url"] = f"{network_lookup[deployment.network_id]['explorer_url']}/address/{deployment.contract_address}"
    await db.contract_deployments.insert_one(doc.copy())
    return doc


@api_router.get("/contracts/deployments", response_model=List[ContractDeployment])
async def list_contract_deployments():
    deployments = await db.contract_deployments.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return deployments


@api_router.post("/contracts/router-allowlist", response_model=RouterAllowlistRecord)
async def save_router_allowlist(record: RouterAllowlistCreate):
    network_lookup = {network["id"]: network for network in RPC_NETWORKS}
    if record.network_id not in network_lookup:
        raise HTTPException(status_code=400, detail="Unsupported router network")
    validate_address(record.router_address, "Router address", required=True)
    doc = record.model_dump()
    doc["router_address"] = doc["router_address"].lower()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = utc_now_iso()
    doc["explorer_url"] = f"{network_lookup[record.network_id]['explorer_url']}/address/{record.router_address}"
    await db.router_allowlist.update_one(
        {"network_id": doc["network_id"], "router_address": doc["router_address"]},
        {"$set": doc},
        upsert=True,
    )
    return doc


@api_router.get("/contracts/router-allowlist", response_model=List[RouterAllowlistRecord])
async def list_router_allowlist():
    routers = await db.router_allowlist.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return routers


@api_router.delete("/contracts/router-allowlist/{router_id}")
async def delete_router_allowlist(router_id: str):
    result = await db.router_allowlist.delete_one({"id": router_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Router record not found")
    return {"deleted": True, "id": router_id}


@api_router.post("/simulation/preflight", response_model=PreflightSimulationResponse)
async def run_preflight_simulation(request: PreflightSimulationRequest):
    network_lookup = {network["id"]: network for network in RPC_NETWORKS}
    if request.network_id not in network_lookup:
        raise HTTPException(status_code=400, detail="Unsupported simulation network")
    validate_address(request.from_address, "From address", required=True)
    validate_address(request.to_address, "To address", required=True)
    if not request.tx_data.startswith("0x"):
        raise HTTPException(status_code=400, detail="tx_data must be hex encoded")

    network = network_lookup[request.network_id]
    rpc_status_data = await check_rpc_network(network)
    url = rpc_url_for(network)
    warnings: List[str] = []
    error = None
    call_success = False
    contract_has_code = False
    gas_estimate = None

    if not url or not rpc_status_data["healthy"]:
        warnings.append("RPC is not healthy; simulation skipped.")
    else:
        tx = {"from": request.from_address, "to": request.to_address, "data": request.tx_data, "value": request.value}
        try:
            code_response = await asyncio.to_thread(rpc_post, url, "eth_getCode", [request.to_address, "latest"])
            code = code_response.get("result", "0x")
            contract_has_code = bool(code and code != "0x")
            if not contract_has_code:
                warnings.append("Target address has no contract code on this network.")
            call_response = await asyncio.to_thread(rpc_post, url, "eth_call", [tx, "latest"])
            call_success = "result" in call_response
            if contract_has_code:
                gas_response = await asyncio.to_thread(rpc_post, url, "eth_estimateGas", [tx])
                gas_estimate = int(gas_response["result"], 16)
        except Exception as exc:
            error = str(exc)[:220]
            warnings.append("Simulation reverted or RPC refused the transaction estimate.")

    response = PreflightSimulationResponse(
        id=str(uuid.uuid4()),
        network_id=request.network_id,
        provider=rpc_provider_name(url),
        rpc_healthy=bool(rpc_status_data["healthy"]),
        contract_has_code=contract_has_code,
        call_success=call_success,
        gas_estimate=gas_estimate,
        warnings=warnings,
        error=error,
        created_at=utc_now_iso(),
    )
    await db.preflight_simulations.insert_one(response.model_dump().copy())
    return response


@api_router.post("/live/obscure-scan", response_model=LiveObscureScanResponse)
async def scan_live_obscure_pairs(request: LiveObscureScanRequest):
    feeds = ["new", "trending"] if request.feed == "both" else [request.feed]
    if any(feed not in {"new", "trending"} for feed in feeds):
        raise HTTPException(status_code=400, detail="feed must be new, trending, or both")

    raw_opportunities: List[Dict[str, Any]] = []
    source_warnings: List[str] = []
    selected_chains = [live_chain_by_id(chain_id) for chain_id in request.chains]
    for chain_id in request.chains:
        chain = live_chain_by_id(chain_id)
        for feed in feeds:
            data = await fetch_live_json(gecko_pool_url(chain["gecko_network"], feed))
            if data.get("_warning"):
                source_warnings.append(data["_warning"])
                continue
            for pool in data.get("data", []):
                opportunity = classify_live_pool(pool, chain, f"geckoterminal:{feed}")
                if live_opportunity_matches(opportunity, request):
                    raw_opportunities.append(apply_live_risk_blocks(opportunity, request))

    dexscreener_opportunities = await fetch_dexscreener_obscure_pairs(selected_chains)
    for opportunity in dexscreener_opportunities:
        if live_opportunity_matches(opportunity, request):
            raw_opportunities.append(apply_live_risk_blocks(opportunity, request))

    raw_opportunities.sort(key=lambda item: (item["execution_blocked"], -item["edge_score"], -item["expected_profit_signal_usd"]))
    unique = []
    seen = set()
    for opportunity in raw_opportunities:
        if opportunity["id"] in seen:
            continue
        seen.add(opportunity["id"])
        unique.append(opportunity)

    response = LiveObscureScanResponse(
        id=str(uuid.uuid4()),
        created_at=utc_now_iso(),
        request=request,
        opportunities=unique[: request.limit],
        sources=["GeckoTerminal public API", "DexScreener public API"],
        source_warnings=source_warnings,
        note="Live mainnet discovery uses public market APIs. Execution remains blocked when configured safety checks detect unknown tax/honeypot risk, unverified DEX metadata, low liquidity, or weak profit signal.",
    )
    await db.live_obscure_scans.insert_one(response.model_dump())
    return response


@api_router.get("/live/obscure-scans/recent", response_model=List[LiveObscureScanResponse])
async def get_recent_live_obscure_scans():
    scans = await db.live_obscure_scans.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return scans


@api_router.post("/opportunities/scan", response_model=ScanResponse)
async def scan_opportunities(request: ScanRequest):
    chain = chain_by_id(request.chain_id)
    provider = provider_by_id(request.provider)
    pair = pair_by_symbol(request.pair)
    dex_lookup = selected_dex_lookup(request.selected_dexes)
    opportunities = calculate_opportunities(request, chain, provider, pair, dex_lookup)
    scan = ScanResponse(
        id=str(uuid.uuid4()),
        created_at=utc_now_iso(),
        request=request,
        opportunities=opportunities[:8],
        best_net_profit_usd=opportunities[0].net_profit_usd if opportunities else 0,
        note="Scanner uses deterministic simulated spreads for testnet strategy tuning; connect production market data before mainnet execution.",
    )
    doc = scan.model_dump()
    await db.arb_scans.insert_one(doc.copy())
    return scan


@api_router.get("/opportunities/recent", response_model=List[ScanResponse])
async def get_recent_scans():
    scans = await db.arb_scans.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return scans


@api_router.post("/strategies", response_model=Strategy)
async def create_strategy(strategy: StrategyCreate):
    chain_by_id(strategy.chain_id)
    provider_by_id(strategy.provider)
    pair_by_symbol(strategy.pair)
    doc = strategy.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = utc_now_iso()
    await db.arb_strategies.insert_one(doc.copy())
    return doc


@api_router.get("/strategies", response_model=List[Strategy])
async def list_strategies():
    strategies = await db.arb_strategies.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return strategies


@api_router.delete("/strategies/{strategy_id}")
async def delete_strategy(strategy_id: str):
    result = await db.arb_strategies.delete_one({"id": strategy_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return {"deleted": True, "id": strategy_id}


@api_router.post("/transactions/build", response_model=TransactionBuildResponse)
async def build_transaction(request: TransactionBuildRequest):
    chain_by_id(request.chain_id)
    provider = provider_by_id(request.provider)
    pair_by_symbol(request.pair)
    contract_address = validate_address(request.contract_address, "Contract address")
    token_borrow = validate_address(request.token_borrow, "Borrow token")
    pool_address = validate_address(request.pool_address, "Uniswap V3 pool")
    warnings = transaction_warnings(provider["id"], contract_address, token_borrow, pool_address)
    validate_transaction_numbers(request)
    function_name, args = transaction_function_args(provider["id"], request, token_borrow, pool_address)

    response = TransactionBuildResponse(
        id=str(uuid.uuid4()),
        chain_id=request.chain_id,
        provider=provider["id"],
        to=contract_address,
        function_name=function_name,
        args=args,
        is_ready_to_send=len(warnings) == 0,
        warnings=warnings,
        created_at=utc_now_iso(),
    )
    await db.arb_transaction_builds.insert_one(response.model_dump())
    return response


@api_router.post("/executions", response_model=ExecutionRecord)
async def create_execution(execution: ExecutionCreate):
    chain_by_id(execution.chain_id)
    provider_by_id(execution.provider)
    pair_by_symbol(execution.pair)
    if not execution.tx_hash.startswith("0x") or len(execution.tx_hash) < 30:
        raise HTTPException(status_code=400, detail="Invalid transaction hash")
    doc = execution.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = utc_now_iso()
    await db.arb_executions.insert_one(doc.copy())
    return doc


@api_router.get("/executions", response_model=List[ExecutionRecord])
async def list_executions():
    executions = await db.arb_executions.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return executions

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc.copy())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# Include the router in the main app
app.include_router(api_router)

cors_origins = [origin.strip() for origin in os.environ.get('CORS_ORIGINS', '*').split(',') if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials='*' not in cors_origins,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
