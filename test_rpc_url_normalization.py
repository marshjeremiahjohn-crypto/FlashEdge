"""Regression tests for RPC URL normalization and RPC/Contracts status integrations."""

from pathlib import Path
import importlib.util
import os

import pytest
import requests
from dotenv import load_dotenv


# Public preview URL used by users
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


@pytest.fixture(scope="session")
def server_module():
    server_path = Path(__file__).resolve().parents[1] / "server.py"
    spec = importlib.util.spec_from_file_location("backend_server", server_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


# URL normalization module checks
def test_normalize_rpc_url_trims_duplicate_https_segment(server_module):
    raw = "https://base-mainnet.g.alchemy.com/v2/demohttps://base-mainnet.g.alchemy.com/v2/demo"
    normalized = server_module.normalize_rpc_url(raw)

    assert normalized == "https://base-mainnet.g.alchemy.com/v2/demo"
    assert normalized.count("https://") == 1


def test_normalize_rpc_url_trims_duplicate_http_segment(server_module):
    raw = "http://rpc.example.org/http://rpc.example.org/"
    normalized = server_module.normalize_rpc_url(raw)

    assert normalized == "http://rpc.example.org/"
    assert normalized.count("http://") == 1


def test_normalize_rpc_url_strips_quotes_and_whitespace(server_module):
    raw = "  'https://arb-mainnet.g.alchemy.com/v2/demo'  "
    normalized = server_module.normalize_rpc_url(raw)

    assert normalized == "https://arb-mainnet.g.alchemy.com/v2/demo"


# RPC status integration checks
def test_rpc_status_mainnets_configured_healthy_and_no_raw_url_leak(api_client, base_url):
    response = api_client.get(f"{base_url}/api/rpc/status")
    assert response.status_code == 200
    rows = response.json()

    by_id = {row["id"]: row for row in rows}
    for network_id in ("base-mainnet", "arbitrum-mainnet"):
        assert network_id in by_id
        item = by_id[network_id]
        assert item["configured"] is True
        assert item["healthy"] is True
        assert "rpc_url" not in item
        assert "url" not in item
        assert "api_key" not in item


# Contracts readiness integration checks
def test_contracts_page_readiness_source_reports_testnet_rpcs_healthy(api_client, base_url):
    response = api_client.get(f"{base_url}/api/contracts/testnet-readiness")
    assert response.status_code == 200
    data = response.json()

    assert "testnet_rpcs" in data and isinstance(data["testnet_rpcs"], list)
    by_id = {row["id"]: row for row in data["testnet_rpcs"]}
    for network_id in ("base-sepolia", "arbitrum-sepolia"):
        assert network_id in by_id
        assert by_id[network_id]["configured"] is True
        assert by_id[network_id]["healthy"] is True
