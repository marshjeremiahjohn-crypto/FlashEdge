"""Contract wallet roles API tests: validation, persistence, and readiness override behavior."""

from pathlib import Path
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv


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


def make_valid_address(prefix: str) -> str:
    suffix = uuid.uuid4().hex
    padded = (prefix + suffix).ljust(40, "a")[:40]
    return f"0x{padded}"


def test_get_wallet_roles_returns_expected_shape(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/wallet-roles")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data.get("owner_wallet"), str)
    assert isinstance(data.get("profit_wallet"), str)
    assert "updated_at" in data


def test_post_wallet_roles_rejects_invalid_owner(api_client, base_url):
    payload = {
        "owner_wallet": "0x1234",
        "profit_wallet": "0x0000000000000000000000000000000000000001",
    }
    response = api_client.post(f"{base_url}/api/contracts/wallet-roles", json=payload)
    assert response.status_code == 400
    assert "Owner wallet must be a valid EVM address" in response.json().get("detail", "")


def test_post_wallet_roles_rejects_invalid_profit(api_client, base_url):
    payload = {
        "owner_wallet": "0x0000000000000000000000000000000000000001",
        "profit_wallet": "0x1234",
    }
    response = api_client.post(f"{base_url}/api/contracts/wallet-roles", json=payload)
    assert response.status_code == 400
    assert "Profit wallet must be a valid EVM address" in response.json().get("detail", "")


def test_post_wallet_roles_saves_and_get_reflects_persistence(api_client, base_url):
    owner = make_valid_address("1")
    profit = make_valid_address("2")

    save_response = api_client.post(
        f"{base_url}/api/contracts/wallet-roles",
        json={"owner_wallet": owner, "profit_wallet": profit},
    )
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["owner_wallet"] == owner.lower()
    assert saved["profit_wallet"] == profit.lower()
    assert isinstance(saved.get("updated_at"), str)

    get_response = api_client.get(f"{base_url}/api/contracts/wallet-roles")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["owner_wallet"] == owner.lower()
    assert fetched["profit_wallet"] == profit.lower()


def test_readiness_wallets_reflect_saved_wallet_role_overrides(api_client, base_url):
    owner = make_valid_address("3")
    profit = make_valid_address("4")

    save_response = api_client.post(
        f"{base_url}/api/contracts/wallet-roles",
        json={"owner_wallet": owner, "profit_wallet": profit},
    )
    assert save_response.status_code == 200

    readiness_response = api_client.get(f"{base_url}/api/contracts/testnet-readiness")
    assert readiness_response.status_code == 200
    readiness = readiness_response.json()

    assert readiness["wallets"]["owner_wallet"] == owner.lower()
    assert readiness["wallets"]["profit_wallet"] == profit.lower()
