"""Regression tests for Base Uniswap router preset and related contracts endpoints."""

from pathlib import Path
import os

import pytest
import requests
from dotenv import load_dotenv


# Use public app URL so tests validate user-facing ingress behavior
load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

PRESET_PAYLOAD = {
    "network_id": "base-mainnet",
    "router_address": "0x2626664c2603336E57B271c5C0b26F421741e481",
    "label": "Uniswap V3 Base Router",
    "dex_type": "v3-swaprouter02",
    "approved": True,
}


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


# Router allowlist module: verify Base preset persistence and list visibility
def test_save_base_uniswap_router_preset(api_client, base_url):
    response = api_client.post(f"{base_url}/api/contracts/router-allowlist", json=PRESET_PAYLOAD)
    assert response.status_code == 200
    data = response.json()

    assert data["network_id"] == "base-mainnet"
    assert data["router_address"] == PRESET_PAYLOAD["router_address"].lower()
    assert data["label"] == "Uniswap V3 Base Router"
    assert data["dex_type"] == "v3-swaprouter02"
    assert data["approved"] is True
    assert data["explorer_url"] == "https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481"


def test_base_uniswap_router_preset_appears_in_router_list(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/router-allowlist")
    assert response.status_code == 200
    routers = response.json()
    assert isinstance(routers, list)

    matched = [
        item for item in routers
        if item.get("network_id") == "base-mainnet"
        and item.get("router_address") == PRESET_PAYLOAD["router_address"].lower()
        and item.get("label") == "Uniswap V3 Base Router"
        and item.get("dex_type") == "v3-swaprouter02"
    ]
    assert len(matched) >= 1


# Preflight module: ensure base-mainnet request path remains operational
def test_preflight_base_mainnet_with_deployed_contract_address(api_client, base_url):
    payload = {
        "network_id": "base-mainnet",
        "from_address": "0x0000000000000000000000000000000000000001",
        "to_address": "0x550f5b7571c256bcc94439B03b77b8Dc836F303B",
        "tx_data": "0x",
        "value": "0x0",
    }
    response = api_client.post(f"{base_url}/api/simulation/preflight", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["network_id"] == "base-mainnet"
    assert isinstance(data["rpc_healthy"], bool)
    assert isinstance(data["contract_has_code"], bool)
    assert isinstance(data["call_success"], bool)
    assert isinstance(data["warnings"], list)
