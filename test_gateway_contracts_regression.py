"""Regression checks for public preview availability and bad-gateway protection."""

from pathlib import Path
import os

import pytest
import requests
from dotenv import load_dotenv


# Module: public preview health and contracts page reachability
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


def test_public_api_root_returns_200(api_client, base_url):
    response = api_client.get(f"{base_url}/api/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Flash arbitrage command API online"
    assert data["mode"] == "testnet-first"


def test_public_contracts_page_returns_200_and_no_gateway_error(api_client, base_url):
    response = api_client.get(f"{base_url}/contracts")
    assert response.status_code == 200
    html = response.text
    assert "Bad Gateway" not in html
    assert "<title>" in html
