"""Backend API regression tests for RPC status and contracts deployment config flows."""

from pathlib import Path
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv


# Load public preview backend URL from frontend env (user-facing endpoint)
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


# RPC health module checks
def test_rpc_status_returns_four_configured_networks_without_url_leak(api_client, base_url):
    response = api_client.get(f"{base_url}/api/rpc/status")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    assert len(data) == 4

    expected = {
        "base-mainnet": "Base Mainnet",
        "base-sepolia": "Base Sepolia",
        "arbitrum-mainnet": "Arbitrum One",
        "arbitrum-sepolia": "Arbitrum Sepolia",
    }
    by_id = {item["id"]: item for item in data}
    assert set(by_id.keys()) == set(expected.keys())

    for network_id, network_name in expected.items():
        item = by_id[network_id]
        assert item["name"] == network_name
        assert isinstance(item["configured"], bool)
        assert isinstance(item["healthy"], bool)
        assert isinstance(item["chain_id_match"], bool)
        assert "provider" in item and isinstance(item["provider"], str)
        assert "latest_block" in item
        # Ensure sensitive raw RPC URL fields are not exposed in API response
        assert "rpc_url" not in item
        assert "url" not in item
        assert "api_key" not in item


# Contracts readiness module checks
def test_contracts_testnet_readiness_returns_two_testnets_and_safety_defaults(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/testnet-readiness")
    assert response.status_code == 200
    data = response.json()

    assert data["contracts"] == ["FlashArbitrageRouter.sol", "BalancerFlashArb.sol", "UniswapV3FlashArb.sol"]
    assert isinstance(data["testnet_rpcs"], list)
    assert len(data["testnet_rpcs"]) == 2

    rpc_ids = {rpc["id"] for rpc in data["testnet_rpcs"]}
    assert rpc_ids == {"base-sepolia", "arbitrum-sepolia"}
    for rpc in data["testnet_rpcs"]:
        assert rpc["deployment_stage"] == "testnet-execution"
        assert isinstance(rpc["healthy"], bool)

    safety = data["safety_defaults"]
    assert safety["min_profit_usd"] == 5
    assert safety["max_slippage_bps"] == 50
    assert safety["gas_cap_usd"] == 7


# Deployment config validation + persistence checks
def test_deployment_config_rejects_invalid_wallet_addresses(api_client, base_url):
    payload = {
        "network_id": "base-sepolia",
        "provider": "balancer",
        "owner_wallet": "0x1234",
        "profit_wallet": "0x0000000000000000000000000000000000000001",
        "max_trade_amount_raw": "1000",
        "max_slippage_bps": 50,
        "min_profit_usd": 5,
        "gas_cap_usd": 7,
    }
    response = api_client.post(f"{base_url}/api/contracts/deployment-config", json=payload)
    assert response.status_code == 400
    assert "Owner wallet must be a valid EVM address" in response.json()["detail"]


def test_deployment_config_save_and_list_without_mongo_objectid_leak(api_client, base_url):
    suffix = uuid.uuid4().hex[:8]
    owner_wallet = f"0x{suffix.rjust(40, '1')}"
    profit_wallet = f"0x{suffix.rjust(40, '2')}"

    create_payload = {
        "network_id": "arbitrum-sepolia",
        "provider": "uniswap-v3",
        "owner_wallet": owner_wallet,
        "profit_wallet": profit_wallet,
        "max_trade_amount_raw": "500000000000000000",
        "max_slippage_bps": 45,
        "min_profit_usd": 6,
        "gas_cap_usd": 6.5,
    }
    create_response = api_client.post(f"{base_url}/api/contracts/deployment-config", json=create_payload)
    assert create_response.status_code == 200
    created = create_response.json()

    assert created["network_id"] == create_payload["network_id"]
    assert created["provider"] == create_payload["provider"]
    assert created["owner_wallet"] == create_payload["owner_wallet"]
    assert created["profit_wallet"] == create_payload["profit_wallet"]
    assert isinstance(created["id"], str) and len(created["id"]) > 10
    assert "_id" not in created

    list_response = api_client.get(f"{base_url}/api/contracts/deployment-config")
    assert list_response.status_code == 200
    items = list_response.json()
    assert isinstance(items, list)

    matched = next((item for item in items if item["id"] == created["id"]), None)
    assert matched is not None
    assert matched["owner_wallet"] == owner_wallet
    assert matched["profit_wallet"] == profit_wallet
    assert "_id" not in matched
