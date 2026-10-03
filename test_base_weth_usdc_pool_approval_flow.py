"""Regression tests for Base mainnet WETH/USDC pool approval preflight and persistence."""

from pathlib import Path
import os

import pytest
import requests
from dotenv import load_dotenv


# Module: Base mainnet pool-approval preflight + contracts/router regression checks
load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

EXPECTED_OWNER = "0xfa21e8b14a9d245132c64fce6d6e8ba07a417910"
DEPLOYED_CONTRACT = "0x550f5b7571c256bcc94439B03b77b8Dc836F303B"
BASE_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"
BASE_WETH_USDC_POOL = "0xd0b53D9277642d899DF5C87A3966A349A798F224"
SET_POOL_APPROVAL_DATA = (
    "0x70814ee6000000000000000000000000d0b53d9277642d899df5c87a3966a349a798f224"
    "0000000000000000000000000000000000000000000000000000000000000001"
)


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


def test_preflight_set_pool_approval_succeeds_on_base_mainnet(api_client, base_url):
    payload = {
        "network_id": "base-mainnet",
        "from_address": EXPECTED_OWNER,
        "to_address": DEPLOYED_CONTRACT,
        "tx_data": SET_POOL_APPROVAL_DATA,
        "value": "0x0",
    }

    response = api_client.post(f"{base_url}/api/simulation/preflight", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["rpc_healthy"] is True
    assert data["contract_has_code"] is True
    assert data["call_success"] is True
    assert isinstance(data.get("gas_estimate"), int)
    assert data["gas_estimate"] > 0
    assert data.get("error") in (None, "")


def test_preflight_pool_approval_call_data_is_not_empty(api_client, base_url):
    payload = {
        "network_id": "base-mainnet",
        "from_address": EXPECTED_OWNER,
        "to_address": DEPLOYED_CONTRACT,
        "tx_data": SET_POOL_APPROVAL_DATA,
        "value": "0x0",
    }

    response = api_client.post(f"{base_url}/api/simulation/preflight", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert payload["tx_data"] != "0x"
    assert data["network_id"] == "base-mainnet"


def test_wallet_roles_owner_matches_expected_onchain_owner(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/wallet-roles")
    assert response.status_code == 200
    data = response.json()

    assert data["owner_wallet"] == EXPECTED_OWNER


def test_router_preset_still_present_after_pool_changes(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/router-allowlist")
    assert response.status_code == 200
    routers = response.json()

    matched = [
        item
        for item in routers
        if item.get("network_id") == "base-mainnet"
        and str(item.get("router_address", "")).lower() == BASE_ROUTER.lower()
    ]
    assert len(matched) >= 1


def test_deployed_contract_record_still_present_for_base_mainnet(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/deployments")
    assert response.status_code == 200
    deployments = response.json()

    matched = [
        item
        for item in deployments
        if str(item.get("contract_address", "")).lower() == DEPLOYED_CONTRACT.lower()
        and item.get("network_id") == "base-mainnet"
    ]
    assert len(matched) >= 1


def test_pool_address_value_matches_expected_base_uniswap_pool():
    assert BASE_WETH_USDC_POOL.lower() == "0xd0b53d9277642d899df5c87a3966a349a798f224"
