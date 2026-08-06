"""Shared fixtures for the live end-to-end integration suite.

Unlike `backend/aria_pi/tests/` (hermetic, every HTTP call mocked), this suite
drives a REAL running stack over the network: the Next.js frontend and the
FastAPI backend it proxies to. It exists to catch the failures unit tests
structurally cannot see — proxy/upstream contract drift, edge-middleware
behavior, rate limiting, and how malformed input survives the whole path.

The suite auto-skips when the servers are not reachable, so it never breaks a
plain `pytest` run. Point it at a stack with:

    MAP_FRONTEND_URL=http://127.0.0.1:3010 \
    MAP_BACKEND_URL=http://127.0.0.1:8000 \
    pytest tests/integration

Never aim it at production: the backend fans out to real public APIs (SEC
EDGAR, NIH, PubMed) and these tests deliberately send abusive input.
"""
import os

import pytest
import requests

# Requests that only exercise validation return fast; anything that reaches the
# upstream fan-out needs real headroom. Two budgets keep slow tests honest.
FAST_TIMEOUT = 15
SLOW_TIMEOUT = 60

DEFAULT_FRONTEND = "http://127.0.0.1:3010"
DEFAULT_BACKEND = "http://127.0.0.1:8000"


def _base_url(env_var: str, default: str) -> str:
    """Read a base URL from the environment.

    Takes: env_var — the variable name; default — the fallback URL.
    Gives: the URL with any trailing slash removed.
    """
    return os.environ.get(env_var, default).rstrip("/")


def _is_up(url: str) -> bool:
    """Check whether a server answers at all.

    Takes: url — the base URL to probe.
    Gives: True when the host responds with any HTTP status, False otherwise.
    """
    try:
        requests.get(url, timeout=5)
        return True
    except requests.RequestException:
        return False


class Client:
    """Thin HTTP client bound to one base URL.

    Keeps tests readable — they pass paths, not URLs — and forces an explicit
    timeout on every call so a hung server fails loudly instead of stalling.
    """

    def __init__(self, base: str):
        """Store the base URL and open a connection-pooled session.

        Takes: base — the server's base URL.
        Gives: nothing.
        """
        self.base = base
        self.session = requests.Session()

    def get(self, path: str, timeout: int = FAST_TIMEOUT, **kwargs):
        """Send a GET to the bound server.

        Takes: path — the URL path; timeout — seconds; kwargs — passed to requests.
        Gives: the requests.Response.
        """
        return self.session.get(f"{self.base}{path}", timeout=timeout, **kwargs)

    def post(self, path: str, timeout: int = FAST_TIMEOUT, **kwargs):
        """Send a POST to the bound server.

        Takes: path — the URL path; timeout — seconds; kwargs — passed to requests.
        Gives: the requests.Response.
        """
        return self.session.post(f"{self.base}{path}", timeout=timeout, **kwargs)


@pytest.fixture(scope="session")
def frontend() -> Client:
    """Provide a client for the Next.js frontend.

    Takes: nothing — reads MAP_FRONTEND_URL.
    Gives: a Client, or skips the test when the frontend is down.
    """
    url = _base_url("MAP_FRONTEND_URL", DEFAULT_FRONTEND)
    if not _is_up(url):
        pytest.skip(f"frontend not reachable at {url}")
    return Client(url)


@pytest.fixture(scope="session")
def backend() -> Client:
    """Provide a client for the FastAPI backend.

    Takes: nothing — reads MAP_BACKEND_URL.
    Gives: a Client, or skips the test when the backend is down.
    """
    url = _base_url("MAP_BACKEND_URL", DEFAULT_BACKEND)
    if not _is_up(url):
        pytest.skip(f"backend not reachable at {url}")
    return Client(url)


def pytest_configure(config):
    """Register the suite's custom markers.

    Takes: config — the pytest config object.
    Gives: nothing; markers become usable without warnings.
    """
    config.addinivalue_line("markers", "integration: drives a live frontend+backend stack")
    config.addinivalue_line("markers", "security: adversarial probe of a hardening control")
    config.addinivalue_line("markers", "slow: reaches the real upstream data-source fan-out")
