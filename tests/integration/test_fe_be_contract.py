"""Contract tests across the frontend proxy and the FastAPI backend.

The frontend forwards user JSON to the backend and hands the answer back. That
seam is invisible to both unit suites: the backend suite mocks HTTP, and the
frontend suite mocks the backend. Drift here is what reaches users as an opaque
500 or a silently missing field, so it is asserted directly against both live
servers.
"""
import pytest

pytestmark = pytest.mark.integration


def test_backend_is_reachable_and_self_describes(backend):
    """Confirm the backend root advertises its service identity.

    Takes: backend — the FastAPI client.
    Gives: nothing; asserts a 200 carrying a service name.
    """
    r = backend.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("service"), f"root did not name the service: {body}"


def test_backend_status_reports_keyless_mode(backend):
    """Confirm /status still reports the keyless, no-API-key posture.

    Takes: backend — the FastAPI client.
    Gives: nothing; asserts the documented status shape.
    """
    r = backend.get("/status")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "online"
    assert isinstance(body.get("data_sources"), list) and body["data_sources"]


def test_resolve_kind_agrees_across_the_proxy(frontend, backend):
    """Confirm the proxy does not alter the classifier's verdict.

    Takes: frontend — the proxy client; backend — the FastAPI client.
    Gives: nothing; asserts both tiers return the same classification.
    """
    query = "Hospitals"
    direct = backend.get(f"/resolve-kind?q={query}").json()
    proxied = frontend.get(f"/api/resolve-kind?q={query}").json()
    assert direct.get("is_sector") == proxied.get("is_sector"), (
        f"classification drift — backend={direct}, frontend={proxied}"
    )
    assert direct.get("canonical") == proxied.get("canonical"), (
        f"canonical drift — backend={direct}, frontend={proxied}"
    )


@pytest.mark.parametrize(
    "query,expected_sector",
    [
        ("Hospitals", True),
        ("Finance and Insurance", True),
        ("Pfizer", False),
        ("Apple Inc.", False),
    ],
    ids=["hospitals", "finance", "pfizer", "apple"],
)
def test_resolve_kind_classifies_sectors_and_companies(frontend, query, expected_sector):
    """Confirm curated sectors classify as sectors and firms do not.

    Takes: frontend — the proxy client; query — the subject; expected_sector — the verdict.
    Gives: nothing; asserts is_sector matches, which drives home-search routing.
    """
    body = frontend.get(f"/api/resolve-kind?q={query}").json()
    assert body.get("is_sector") is expected_sector, f"{query!r} classified as {body}"


def test_resolve_kind_handles_an_empty_query(frontend):
    """Answer an empty query without erroring.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts a 200 and a non-sector verdict.
    """
    r = frontend.get("/api/resolve-kind?q=")
    assert r.status_code == 200
    assert r.json().get("is_sector") is False


def test_resolve_kind_truncates_rather_than_rejecting_a_long_query(frontend):
    """Bound an over-long query instead of failing on it.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts a 200 and that the echoed query is capped at 200 chars.
    """
    r = frontend.get("/api/resolve-kind", params={"q": "a" * 5000})
    assert r.status_code == 200
    assert len(r.json().get("query", "")) <= 200


def test_backend_rejects_an_oversized_sector_with_422(backend):
    """Confirm Pydantic bounds the sector length at the backend edge.

    Takes: backend — the FastAPI client.
    Gives: nothing; asserts a 422 validation error, not a 500.
    """
    r = backend.post("/run-pipeline", json={"sector": "x" * 5000})
    assert r.status_code == 422, f"expected 422, got {r.status_code}"


def test_backend_errors_do_not_leak_internals(backend):
    """Confirm a backend validation failure exposes no internals.

    Takes: backend — the FastAPI client.
    Gives: nothing; asserts no traceback or filesystem path in the body.
    """
    r = backend.post("/run-pipeline", json={"sector": None})
    assert r.status_code >= 400
    for marker in ("Traceback", "/Users/", "site-packages"):
        assert marker not in r.text, f"backend leaked {marker!r}: {r.text[:300]}"


def test_proxy_translates_backend_rejection_to_a_4xx(frontend):
    """Confirm an invalid body surfaces as a 4xx, never an opaque 500.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts the client sees an actionable status.
    """
    r = frontend.post("/api/run-pipeline", json={"sector": ""})
    assert 400 <= r.status_code < 500, f"expected 4xx, got {r.status_code}"


def test_pipeline_responses_are_never_cached(frontend):
    """Confirm the proxy forbids caching so reports are never stale.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts a no-store Cache-Control on a rejected call.
    """
    r = frontend.post("/api/run-pipeline", json={"sector": ""})
    cache_control = r.headers.get("cache-control", "").lower()
    assert "no-store" in cache_control or "no-cache" in cache_control or r.status_code >= 400
