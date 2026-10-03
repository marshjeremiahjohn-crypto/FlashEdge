"""Regression tests for Base mainnet router-approval defaults and preflight success."""

from pathlib import Path
import os

import pytest
import requests
from dotenv import load_dotenv


# Module: Base mainnet owner/profit sync + setRouterApproval preflight + persistence checks
load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")

EXPECTED_OWNER = "0xfa21e8b14a9d245132c64fce6d6e8ba07a417910"
EXPECTED_PROFIT = "0x65eaa9c97d856b9115b1e19be49a3d7f17209150"
DEPLOYED_CONTRACT = "0x550f5b7571c256bcc94439B03b77b8Dc836F303B"
BASE_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"
SET_ROUTER_APPROVAL_DATA = (
    "0x47c1a9be0000000000000000000000002626664c2603336e57b271c5c0b26f421741e481"
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


def test_wallet_roles_synced_to_onchain_owner_and_profit(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/wallet-roles")
    assert response.status_code == 200
    data = response.json()

    assert data["owner_wallet"] == EXPECTED_OWNER
    assert data["profit_wallet"] == EXPECTED_PROFIT


def test_contracts_readiness_wallets_match_synced_roles(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/testnet-readiness")
    assert response.status_code == 200
    readiness = response.json()

    assert readiness["wallets"]["owner_wallet"] == EXPECTED_OWNER
    assert readiness["wallets"]["profit_wallet"] == EXPECTED_PROFIT


def test_preflight_set_router_approval_succeeds_on_base_mainnet(api_client, base_url):
    payload = {
        "network_id": "base-mainnet",
        "from_address": EXPECTED_OWNER,
        "to_address": DEPLOYED_CONTRACT,
        "tx_data": SET_ROUTER_APPROVAL_DATA,
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
    warnings_text = " ".join(data.get("warnings", [])).lower()
    assert "execution reverted" not in warnings_text


def test_router_preset_still_present(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/router-allowlist")
    assert response.status_code == 200
    routers = response.json()

    matched = [
        item for item in routers
        if item.get("network_id") == "base-mainnet"
        and str(item.get("router_address", "")).lower() == BASE_ROUTER.lower()
    ]
    assert len(matched) >= 1


def test_deployed_contract_record_still_present(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/deployments")
    assert response.status_code == 200
    deployments = response.json()

    matched = [
        item for item in deployments
        if str(item.get("contract_address", "")).lower() == DEPLOYED_CONTRACT.lower()
        and item.get("network_id") == "base-mainnet"
    ]
    assert len(matched) >= 1
