"""Backend API tests for live obscure discovery and risk-block controls."""

from pathlib import Path
import os

import pytest
import requests
from dotenv import load_dotenv


# Load public preview backend URL from frontend env
load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


@pytest.fixture(scope="session")
def base_url():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is missing")
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# Config endpoint coverage for live chains
def test_config_includes_base_and_arbitrum_live_chains(api_client, base_url):
    response = api_client.get(f"{base_url}/api/config")
    assert response.status_code == 200
    data = response.json()

    live_chains = data.get("live_chains", [])
    assert isinstance(live_chains, list)
    assert any(chain.get("id") == "base" and chain.get("name") == "Base Mainnet" for chain in live_chains)
    assert any(chain.get("id") == "arbitrum" and chain.get("name") == "Arbitrum One" for chain in live_chains)


# Live obscure scan success and response schema coverage
def test_live_obscure_scan_returns_live_opportunities_with_expected_fields(api_client, base_url):
    payload = {
        "chains": ["base", "arbitrum"],
        "feed": "both",
        "min_liquidity_usd": 0,
        "max_liquidity_usd": 100000000,
        "min_volume_24h_usd": 0,
        "min_profit_usd": 0,
        "focus_new_pools": False,
        "focus_stable_mispricing": False,
        "focus_microcaps": False,
        "require_verified_dex": False,
        "block_unknown_tax": False,
        "limit": 20,
    }
    response = api_client.post(f"{base_url}/api/live/obscure-scan", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data.get("live") is True
    assert data.get("request", {}).get("chains") == ["base", "arbitrum"]
    assert isinstance(data.get("opportunities"), list)

    if not data["opportunities"]:
        pytest.skip("No live opportunities returned in this run")

    opportunity = data["opportunities"][0]
    expected_fields = {
        "chain_name",
        "dex_id",
        "pool_address",
        "pair_name",
        "liquidity_usd",
        "volume_24h_usd",
        "edge_score",
        "expected_profit_signal_usd",
        "risk_flags",
        "execution_blocked",
        "block_reasons",
    }
    assert expected_fields.issubset(set(opportunity.keys()))


# Risk control: unknown tax/honeypot block behavior
def test_live_obscure_scan_blocks_for_unknown_tax_when_enabled(api_client, base_url):
    payload = {
        "chains": ["base", "arbitrum"],
        "feed": "both",
        "min_liquidity_usd": 0,
        "max_liquidity_usd": 100000000,
        "min_volume_24h_usd": 0,
        "min_profit_usd": 0,
        "focus_new_pools": False,
        "focus_stable_mispricing": False,
        "focus_microcaps": False,
        "require_verified_dex": False,
        "block_unknown_tax": True,
        "limit": 15,
    }
    response = api_client.post(f"{base_url}/api/live/obscure-scan", json=payload)
    assert response.status_code == 200
    opportunities = response.json().get("opportunities", [])
    if not opportunities:
        pytest.skip("No live opportunities available to evaluate block behavior")

    assert all(item.get("execution_blocked") is True for item in opportunities)
    assert all("Unknown tax/honeypot risk" in item.get("block_reasons", []) for item in opportunities)


# Risk control: unverified dex block behavior
def test_live_obscure_scan_blocks_unverified_dex_when_required(api_client, base_url):
    payload = {
        "chains": ["base", "arbitrum"],
        "feed": "both",
        "min_liquidity_usd": 0,
        "max_liquidity_usd": 100000000,
        "min_volume_24h_usd": 0,
        "min_profit_usd": 0,
        "focus_new_pools": False,
        "focus_stable_mispricing": False,
        "focus_microcaps": False,
        "require_verified_dex": True,
        "block_unknown_tax": False,
        "limit": 40,
    }
    response = api_client.post(f"{base_url}/api/live/obscure-scan", json=payload)
    assert response.status_code == 200
    opportunities = response.json().get("opportunities", [])
    if not opportunities:
        pytest.skip("No live opportunities available to evaluate verified dex block behavior")

    unverified = [item for item in opportunities if not item.get("dex_verified")]
    if not unverified:
        pytest.skip("No unverified dex opportunities in this run")

    assert all(item.get("execution_blocked") is True for item in unverified)
    assert all("Router/factory not verified" in item.get("block_reasons", []) for item in unverified)


# Input validation for live feed field
def test_live_obscure_scan_rejects_invalid_feed(api_client, base_url):
    payload = {
        "chains": ["base", "arbitrum"],
        "feed": "invalid-feed",
        "min_liquidity_usd": 5000,
        "max_liquidity_usd": 2500000,
        "min_volume_24h_usd": 500,
        "min_profit_usd": 25,
        "focus_new_pools": True,
        "focus_stable_mispricing": True,
        "focus_microcaps": True,
        "require_verified_dex": True,
        "block_unknown_tax": True,
        "limit": 20,
    }
    response = api_client.post(f"{base_url}/api/live/obscure-scan", json=payload)
    assert response.status_code == 400
