"""Security tests for the ARIA-PI backend.

Covers the hardening added to the orchestrator and the SSRF guard:
  • CORS is restricted to known origins (no wildcard reflection).
  • Pydantic length/size caps reject abusive input with 422.
  • The error handler does not leak internal exception text to clients.
  • net_guard.assert_public_url blocks private/loopback/link-local hosts and
    non-HTTP(S) schemes while allowing public addresses.

All tests are hermetic — none touch the network. The net_guard cases use IP
literals so getaddrinfo resolves them without DNS.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from aria_pi.orchestrator import app
from aria_pi.utils.net_guard import assert_public_url, UnsafeURLError

client = TestClient(app)


# ── CORS ─────────────────────────────────────────────────────────────────────

def test_cors_does_not_reflect_arbitrary_origin():
    """
    Takes: A request carrying a disallowed Origin header.
    Does: Calls /status with Origin https://evil.example.com.
    Returns: The response must NOT echo that origin back as allowed.
    """
    r = client.get("/status", headers={"Origin": "https://evil.example.com"})
    allow = r.headers.get("access-control-allow-origin")
    assert allow != "https://evil.example.com"
    assert allow != "*"


def test_cors_allows_configured_frontend_origin():
    """
    Takes: A request carrying the allowed production frontend Origin.
    Does: Calls /status with that Origin.
    Returns: The response echoes that exact origin as allowed.
    """
    origin = "https://map-omega-azure.vercel.app"
    r = client.get("/status", headers={"Origin": origin})
    assert r.headers.get("access-control-allow-origin") == origin


# ── Input size / shape caps ──────────────────────────────────────────────────

def test_run_pipeline_rejects_oversized_sector():
    """
    Takes: A /run-pipeline body whose sector exceeds the 200-char cap.
    Does: POSTs the oversized payload.
    Returns: 422 (Pydantic validation) — the pipeline never runs.
    """
    r = client.post("/run-pipeline", json={"sector": "x" * 5000})
    assert r.status_code == 422


def test_run_pipeline_rejects_too_many_companies():
    """
    Takes: A /run-pipeline body with more than 25 override companies.
    Does: POSTs the oversized fan-out list.
    Returns: 422 — the abusive fan-out is rejected before any fetch.
    """
    r = client.post("/run-pipeline", json={"sector": "oncology",
                                           "companies": ["Acme"] * 100})
    assert r.status_code == 422


def test_partnerships_rejects_empty_query():
    """
    Takes: A /api/partnerships body with an empty query.
    Does: POSTs the empty query.
    Returns: 422 — min_length=1 is enforced.
    """
    r = client.post("/api/partnerships", json={"query": "", "type": "company"})
    assert r.status_code == 422


# ── Error-message hygiene ────────────────────────────────────────────────────

def test_pipeline_error_does_not_leak_internals():
    """
    Takes: A valid request, but with a client patched to raise a secret error.
    Does: Forces an exception deep in the pipeline.
    Returns: 500 whose detail is the generic message, never the raw exception.
    """
    secret = "SECRET_DB_PASSWORD_leaked"
    with patch("aria_pi.orchestrator.SECEdgarClient",
               side_effect=RuntimeError(secret)):
        r = client.post("/run-pipeline", json={"sector": "oncology"})
    assert r.status_code == 500
    assert secret not in r.text
    assert r.json()["detail"] == "Internal error while generating the report."


# ── SSRF guard ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "http://169.254.169.254/latest/meta-data/",  # cloud metadata (link-local)
    "http://127.0.0.1/admin",                      # loopback
    "http://10.0.0.5/internal",                    # private RFC 1918
    "http://192.168.1.1/",                         # private RFC 1918
    "https://[::1]/",                               # IPv6 loopback
    "file:///etc/passwd",                          # non-http(s) scheme
    "ftp://example.com/x",                         # non-http(s) scheme
])
def test_assert_public_url_blocks_unsafe(url):
    """
    Takes: A URL pointing at a private host or using a forbidden scheme.
    Does: Calls assert_public_url(url).
    Returns: It raises UnsafeURLError (the fetch is blocked).
    """
    with pytest.raises(UnsafeURLError):
        assert_public_url(url)


@pytest.mark.parametrize("url", [
    "http://8.8.8.8/",        # public IPv4 literal — no DNS needed
    "https://1.1.1.1/path",   # public IPv4 literal
])
def test_assert_public_url_allows_public(url):
    """
    Takes: A URL pointing at a public IP literal.
    Does: Calls assert_public_url(url).
    Returns: It does not raise (the fetch is allowed).
    """
    assert_public_url(url)  # must not raise
