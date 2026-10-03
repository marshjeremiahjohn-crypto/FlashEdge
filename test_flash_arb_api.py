"""Backend API regression tests for flash arbitrage MVP endpoints."""

from pathlib import Path
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv


# Load frontend env to get public preview backend URL used by users
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


# Core API health/config checks
def test_api_root_online(api_client, base_url):
    response = api_client.get(f"{base_url}/api/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Flash arbitrage command API online"
    assert data["mode"] == "testnet-first"


def test_config_contains_supported_entities(api_client, base_url):
    response = api_client.get(f"{base_url}/api/config")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["chains"], list) and len(data["chains"]) == 3
    assert any(chain["chain_id"] == 84532 for chain in data["chains"])
    assert any(provider["id"] == "balancer" for provider in data["providers"])
    assert any(dex["id"] == "curve" for dex in data["dexes"])
    assert any(pair["symbol"] == "WETH/USDC" for pair in data["pairs"])


# Opportunity scan behavior
def test_scan_accepts_adjustable_inputs_and_returns_payload(api_client, base_url):
    payload = {
        "chain_id": 84532,
        "provider": "balancer",
        "pair": "WETH/USDC",
        "loan_amount": 250000,
        "selected_dexes": ["uniswap-v2", "uniswap-v3", "curve"],
        "max_slippage_bps": 60,
        "min_profit_usd": 5,
        "gas_gwei": 0.7,
        "route_depth": 3,
        "risk_profile": "aggressive",
    }
    response = api_client.post(f"{base_url}/api/opportunities/scan", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["request"]["chain_id"] == payload["chain_id"]
    assert data["request"]["provider"] == payload["provider"]
    assert data["request"]["pair"] == payload["pair"]
    assert data["simulated"] is True
    assert "deterministic simulated spreads" in data["note"]
    assert isinstance(data["opportunities"], list)


def test_scan_rejects_less_than_two_dex_routes(api_client, base_url):
    payload = {
        "chain_id": 84532,
        "provider": "balancer",
        "pair": "WETH/USDC",
        "loan_amount": 100000,
        "selected_dexes": ["curve"],
        "max_slippage_bps": 45,
        "min_profit_usd": 0,
        "gas_gwei": 0.35,
        "route_depth": 2,
        "risk_profile": "balanced",
    }
    response = api_client.post(f"{base_url}/api/opportunities/scan", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Select at least two DEX routes"


# Strategy CRUD flows
def test_strategy_crud_create_get_delete(api_client, base_url):
    strategy_name = f"TEST_pytest_{uuid.uuid4().hex[:8]}"
    create_payload = {
        "name": strategy_name,
        "chain_id": 84532,
        "provider": "balancer",
        "pair": "WETH/USDC",
        "loan_amount": 125000,
        "selected_dexes": ["uniswap-v2", "uniswap-v3", "sushiswap"],
        "max_slippage_bps": 40,
        "min_profit_usd": 20,
        "risk_profile": "balanced",
    }
    create_response = api_client.post(f"{base_url}/api/strategies", json=create_payload)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["name"] == strategy_name
    assert created["pair"] == "WETH/USDC"
    strategy_id = created["id"]

    list_response = api_client.get(f"{base_url}/api/strategies")
    assert list_response.status_code == 200
    strategies = list_response.json()
    matched = next((s for s in strategies if s["id"] == strategy_id), None)
    assert matched is not None
    assert matched["name"] == strategy_name

    delete_response = api_client.delete(f"{base_url}/api/strategies/{strategy_id}")
    assert delete_response.status_code == 200
    deleted = delete_response.json()
    assert deleted["deleted"] is True
    assert deleted["id"] == strategy_id

    verify_response = api_client.get(f"{base_url}/api/strategies")
    assert verify_response.status_code == 200
    remaining = verify_response.json()
    assert all(s["id"] != strategy_id for s in remaining)


def test_strategy_delete_unknown_id_returns_404(api_client, base_url):
    response = api_client.delete(f"{base_url}/api/strategies/non-existent-id")
    assert response.status_code == 404
    assert response.json()["detail"] == "Strategy not found"


# Transaction builder validations
def test_transaction_build_returns_function_args_and_warnings(api_client, base_url):
    payload = {
        "chain_id": 84532,
        "provider": "balancer",
        "pair": "WETH/USDC",
        "contract_address": None,
        "token_borrow": None,
        "pool_address": None,
        "loan_amount_raw": "1000000000000000000",
        "min_profit_raw": "0",
        "route_data": "0x",
    }
    response = api_client.post(f"{base_url}/api/transactions/build", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["function_name"] == "executeBalancerFlashArb"
    assert len(data["args"]) == 4
    assert data["is_ready_to_send"] is False
    assert any("Deploy the provided smart contract" in warning for warning in data["warnings"])


def test_transaction_build_rejects_invalid_contract_address(api_client, base_url):
    payload = {
        "chain_id": 84532,
        "provider": "balancer",
        "pair": "WETH/USDC",
        "contract_address": "0x1234",
        "token_borrow": "0x0000000000000000000000000000000000000001",
        "pool_address": None,
        "loan_amount_raw": "1",
        "min_profit_raw": "0",
        "route_data": "0x",
    }
    response = api_client.post(f"{base_url}/api/transactions/build", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Contract address must be a valid EVM address"


# Executions create/list
def test_executions_create_and_list(api_client, base_url):
    tx_hash = "0x" + ("ab" * 32)
    create_payload = {
        "chain_id": 84532,
        "provider": "balancer",
        "pair": "WETH/USDC",
        "tx_hash": tx_hash,
        "net_profit_usd": 42.5,
        "status": "submitted",
    }
    create_response = api_client.post(f"{base_url}/api/executions", json=create_payload)
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["tx_hash"] == tx_hash
    assert created["status"] == "submitted"
    created_id = created["id"]

    list_response = api_client.get(f"{base_url}/api/executions")
    assert list_response.status_code == 200
    executions = list_response.json()
    matched = next((item for item in executions if item["id"] == created_id), None)
    assert matched is not None
    assert matched["pair"] == "WETH/USDC"


def test_executions_reject_invalid_tx_hash(api_client, base_url):
    payload = {
        "chain_id": 84532,
        "provider": "balancer",
        "pair": "WETH/USDC",
        "tx_hash": "0x123",
        "status": "submitted",
    }
    response = api_client.post(f"{base_url}/api/executions", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid transaction hash"