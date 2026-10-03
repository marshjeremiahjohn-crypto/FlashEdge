"""Backend API regression tests for router allowlist and preflight simulation flows."""

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


# Router allowlist module: validation + persistence + delete checks
def test_router_allowlist_rejects_invalid_router_address(api_client, base_url):
    payload = {
        "network_id": "base-sepolia",
        "router_address": "0x1234",
        "label": "TEST_Invalid",
        "dex_type": "v2-compatible",
        "approved": True,
    }
    response = api_client.post(f"{base_url}/api/contracts/router-allowlist", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Router address must be a valid EVM address"


def test_router_allowlist_save_list_delete_without_mongo_objectid_leak(api_client, base_url):
    suffix = uuid.uuid4().hex[:8]
    router_address = f"0x{suffix.rjust(40, 'a')}"
    create_payload = {
        "network_id": "base-sepolia",
        "router_address": router_address,
        "label": f"TEST_router_{suffix}",
        "dex_type": "v2-compatible",
        "approved": True,
    }

    create_response = api_client.post(f"{base_url}/api/contracts/router-allowlist", json=create_payload)
    assert create_response.status_code == 200
    created = create_response.json()

    assert created["network_id"] == create_payload["network_id"]
    assert created["router_address"] == create_payload["router_address"].lower()
    assert created["label"] == create_payload["label"]
    assert isinstance(created["id"], str) and len(created["id"]) > 10
    assert created["explorer_url"].startswith("https://sepolia.basescan.org/address/")
    assert "_id" not in created

    list_response = api_client.get(f"{base_url}/api/contracts/router-allowlist")
    assert list_response.status_code == 200
    routers = list_response.json()
    assert isinstance(routers, list)

    matched = next((item for item in routers if item["id"] == created["id"]), None)
    assert matched is not None
    assert matched["router_address"] == create_payload["router_address"].lower()
    assert "_id" not in matched

    delete_response = api_client.delete(f"{base_url}/api/contracts/router-allowlist/{created['id']}")
    assert delete_response.status_code == 200
    deleted = delete_response.json()
    assert deleted["deleted"] is True
    assert deleted["id"] == created["id"]

    verify_response = api_client.get(f"{base_url}/api/contracts/router-allowlist")
    assert verify_response.status_code == 200
    remaining = verify_response.json()
    assert all(item["id"] != created["id"] for item in remaining)


# Preflight simulation module: validation + safe response schema checks
def test_preflight_rejects_invalid_network(api_client, base_url):
    payload = {
        "network_id": "optimism-sepolia",
        "from_address": "0x0000000000000000000000000000000000000001",
        "to_address": "0x0000000000000000000000000000000000000002",
        "tx_data": "0x",
        "value": "0x0",
    }
    response = api_client.post(f"{base_url}/api/simulation/preflight", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported simulation network"


def test_preflight_rejects_invalid_from_address(api_client, base_url):
    payload = {
        "network_id": "base-sepolia",
        "from_address": "0x1234",
        "to_address": "0x0000000000000000000000000000000000000002",
        "tx_data": "0x",
        "value": "0x0",
    }
    response = api_client.post(f"{base_url}/api/simulation/preflight", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "From address must be a valid EVM address"


def test_preflight_rejects_non_hex_tx_data(api_client, base_url):
    payload = {
        "network_id": "base-sepolia",
        "from_address": "0x0000000000000000000000000000000000000001",
        "to_address": "0x0000000000000000000000000000000000000002",
        "tx_data": "deadbeef",
        "value": "0x0",
    }
    response = api_client.post(f"{base_url}/api/simulation/preflight", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "tx_data must be hex encoded"


def test_preflight_returns_safe_result_shape_without_rpc_url_leak(api_client, base_url):
    payload = {
        "network_id": "base-sepolia",
        "from_address": "0x0000000000000000000000000000000000000001",
        "to_address": "0x0000000000000000000000000000000000000002",
        "tx_data": "0x",
        "value": "0x0",
    }
    response = api_client.post(f"{base_url}/api/simulation/preflight", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["network_id"] == "base-sepolia"
    assert isinstance(data["provider"], str)
    assert isinstance(data["rpc_healthy"], bool)
    assert isinstance(data["contract_has_code"], bool)
    assert isinstance(data["call_success"], bool)
    assert isinstance(data["warnings"], list)
    assert "created_at" in data
    assert "_id" not in data
    assert "rpc_url" not in data
    assert "url" not in data
    assert "api_key" not in data
