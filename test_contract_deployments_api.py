"""Backend API regression tests for contract deployment helper save/list/validation flows."""

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


# Deployment helper module: save/list deployment records
def test_contract_deployment_save_and_list_without_mongo_objectid_leak(api_client, base_url):
    suffix = uuid.uuid4().hex[:6]
    contract_address = f"0x{suffix.rjust(40, 'a')}"
    owner_wallet = f"0x{suffix.rjust(40, 'b')}"
    profit_wallet = f"0x{suffix.rjust(40, 'c')}"

    create_payload = {
        "network_id": "base-sepolia",
        "provider": "balancer",
        "contract_name": "BalancerFlashArb",
        "contract_address": contract_address,
        "constructor_args": [
            "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
            "500000000000000000",
            profit_wallet,
        ],
        "owner_wallet": owner_wallet,
        "profit_wallet": profit_wallet,
        "status": "deployed",
        "notes": f"TEST_pytest_{suffix}",
    }

    create_response = api_client.post(f"{base_url}/api/contracts/deployments", json=create_payload)
    assert create_response.status_code == 200
    created = create_response.json()

    assert created["network_id"] == create_payload["network_id"]
    assert created["provider"] == create_payload["provider"]
    assert created["contract_name"] == create_payload["contract_name"]
    assert created["contract_address"] == create_payload["contract_address"]
    assert created["owner_wallet"] == create_payload["owner_wallet"]
    assert created["profit_wallet"] == create_payload["profit_wallet"]
    assert created["constructor_args"] == create_payload["constructor_args"]
    assert isinstance(created["id"], str) and len(created["id"]) > 10
    assert created["explorer_url"].startswith("https://sepolia.basescan.org/address/")
    assert "_id" not in created

    list_response = api_client.get(f"{base_url}/api/contracts/deployments")
    assert list_response.status_code == 200
    deployments = list_response.json()
    assert isinstance(deployments, list)

    matched = next((item for item in deployments if item["id"] == created["id"]), None)
    assert matched is not None
    assert matched["contract_address"] == contract_address
    assert matched["contract_name"] == "BalancerFlashArb"
    assert "_id" not in matched


# Deployment helper module: invalid input rejection checks
def test_contract_deployment_rejects_invalid_contract_address(api_client, base_url):
    payload = {
        "network_id": "base-sepolia",
        "provider": "balancer",
        "contract_name": "BalancerFlashArb",
        "contract_address": "0x1234",
        "constructor_args": [],
        "owner_wallet": "0x0000000000000000000000000000000000000001",
        "profit_wallet": "0x0000000000000000000000000000000000000002",
        "status": "deployed",
        "notes": "TEST_invalid_address",
    }

    response = api_client.post(f"{base_url}/api/contracts/deployments", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Contract address must be a valid EVM address"


def test_contract_deployment_rejects_unsupported_network(api_client, base_url):
    payload = {
        "network_id": "optimism-sepolia",
        "provider": "balancer",
        "contract_name": "BalancerFlashArb",
        "contract_address": "0x0000000000000000000000000000000000000003",
        "constructor_args": [],
        "owner_wallet": "0x0000000000000000000000000000000000000001",
        "profit_wallet": "0x0000000000000000000000000000000000000002",
        "status": "deployed",
        "notes": "TEST_invalid_network",
    }

    response = api_client.post(f"{base_url}/api/contracts/deployments", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported deployment network"


def test_contract_deployment_rejects_unsupported_provider(api_client, base_url):
    payload = {
        "network_id": "arbitrum-sepolia",
        "provider": "aave",
        "contract_name": "BalancerFlashArb",
        "contract_address": "0x0000000000000000000000000000000000000003",
        "constructor_args": [],
        "owner_wallet": "0x0000000000000000000000000000000000000001",
        "profit_wallet": "0x0000000000000000000000000000000000000002",
        "status": "deployed",
        "notes": "TEST_invalid_provider",
    }

    response = api_client.post(f"{base_url}/api/contracts/deployments", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported flash loan provider"


def test_contract_deployment_rejects_unsupported_contract_name(api_client, base_url):
    payload = {
        "network_id": "arbitrum-sepolia",
        "provider": "uniswap-v3",
        "contract_name": "FlashArbitrageRouter",
        "contract_address": "0x0000000000000000000000000000000000000003",
        "constructor_args": [],
        "owner_wallet": "0x0000000000000000000000000000000000000001",
        "profit_wallet": "0x0000000000000000000000000000000000000002",
        "status": "deployed",
        "notes": "TEST_invalid_contract_name",
    }

    response = api_client.post(f"{base_url}/api/contracts/deployments", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported contract name"
