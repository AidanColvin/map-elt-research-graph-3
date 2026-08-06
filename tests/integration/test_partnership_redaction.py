"""Proof that no investigator's name reaches an unapproved caller.

This is the safety net for `map/lib/redactPeople.ts`, and it is written to
survive that module being wrong. Rather than checking the fields someone
remembered to redact, it asks the BACKEND what names exist for a subject, then
asserts that not one of those strings appears anywhere in the proxy's response.

That distinction matters: the first version of the redactor listed `pi_name`,
`authors` and `top_authors`, stamped `"_redacted": true` on the payload, and
still shipped four real investigators through `unc_authors`, `pi` and
`nih_pis[].name`. A test that only checked the listed fields would have passed.
This one fails until every last name is gone, including in fields nobody has
thought of yet.
"""
import pytest

from conftest import SLOW_TIMEOUT

pytestmark = [pytest.mark.integration, pytest.mark.security, pytest.mark.slow]

# A subject with dense, real UNC ties, so there are actual names to leak.
SUBJECT = {"query": "Pfizer", "type": "company"}

# Keys the backend uses for people. Used only to HARVEST names from the
# upstream payload — never to decide what counts as redacted.
PERSON_KEYS = {"pi", "pi_name", "name", "authors", "top_authors", "unc_authors"}

# Substrings that are structural rather than personal, so a harvested "name"
# matching one of these is not evidence of a leak.
NON_PERSON = {"redacted", "hidden", "n/a", "none", "unknown", ""}

# The generic `name` key carries INSTITUTIONS as well as people — "UNC School of
# Medicine", "UNC Lineberger Comprehensive Cancer Center". Those are supposed to
# survive redaction (the product still has to say WHERE a tie sits), so they are
# not leaks. These markers separate an organization from a person; no individual's
# name contains them.
ORG_MARKERS = (
    "school", "center", "centre", "university", "institute", "department",
    "college", "hospital", "laboratory", "division", "program", "foundation",
    "health", "unc ", "network", "ahec", "system", "consortium", "office",
    "data", "registry", "council", "alliance", "association",
)


def looks_like_a_person(value: str) -> bool:
    """Decide whether a harvested string names an individual.

    Takes: value — a string pulled from a person-ish field.
    Gives: True when it looks like a human name rather than an organization.
    """
    cleaned = value.strip()
    if len(cleaned) < 4 or cleaned.lower() in NON_PERSON:
        return False
    lowered = cleaned.lower()
    return not any(marker in lowered for marker in ORG_MARKERS)


def harvest_names(node, out: set) -> None:
    """Collect every personal name the backend returned.

    Takes: node — any JSON value; out — the set to add names to.
    Gives: nothing; `out` is populated in place.
    """
    if isinstance(node, dict):
        for key, value in node.items():
            if key in PERSON_KEYS:
                if isinstance(value, str):
                    out.add(value)
                elif isinstance(value, list):
                    out.update(v for v in value if isinstance(v, str))
            harvest_names(value, out)
    elif isinstance(node, list):
        for item in node:
            harvest_names(item, out)


def find_leaks(haystack: str, names: set) -> list:
    """Find which names survived into a response body.

    Takes: haystack — the proxied response text; names — names from upstream.
    Gives: a sorted list of the names that leaked.
    """
    return sorted(n.strip() for n in names if looks_like_a_person(n) and n.strip() in haystack)


@pytest.fixture(scope="module")
def upstream_names(backend) -> set:
    """Harvest the real investigator names the backend returns.

    Takes: backend — the FastAPI client.
    Gives: the set of personal names present upstream; skips if none exist.
    """
    response = backend.post("/api/partnerships", json=SUBJECT, timeout=SLOW_TIMEOUT)
    if response.status_code != 200:
        pytest.skip(f"backend returned {response.status_code} for {SUBJECT['query']}")
    names = set()
    harvest_names(response.json(), names)
    real = {n for n in names if looks_like_a_person(n)}
    if not real:
        pytest.skip("backend returned no personal names for this subject")
    return real


def test_backend_really_does_return_names(upstream_names):
    """Confirm the fixture found names, so the leak test is meaningful.

    Takes: upstream_names — names harvested from the backend.
    Gives: nothing; guards against a false pass from an empty payload.
    """
    assert len(upstream_names) >= 2, f"expected several names upstream, got {upstream_names}"


def test_no_investigator_name_reaches_an_anonymous_caller(frontend, upstream_names):
    """Assert an unauthenticated caller receives zero real names.

    Takes: frontend — the proxy client; upstream_names — names from upstream.
    Gives: nothing; fails listing every name that survived the proxy.
    """
    response = frontend.post("/api/partnerships", json=SUBJECT, timeout=SLOW_TIMEOUT)
    assert response.status_code == 200, f"proxy returned {response.status_code}"

    leaked = find_leaks(response.text, upstream_names)
    assert not leaked, (
        f"{len(leaked)} investigator name(s) reached an anonymous caller: {leaked}. "
        "Add the carrying field to NAME_KEYS or PEOPLE_CONTAINERS in map/lib/redactPeople.ts."
    )


def test_a_forged_bearer_token_does_not_unlock_names(frontend, upstream_names):
    """Assert an attacker-supplied token cannot lift the redaction.

    Takes: frontend — the proxy client; upstream_names — names from upstream.
    Gives: nothing; fails if a bogus token reveals any name.
    """
    forged = {"Authorization": "Bearer not.a.real.token"}
    response = frontend.post(
        "/api/partnerships", json=SUBJECT, headers=forged, timeout=SLOW_TIMEOUT
    )
    assert response.status_code == 200

    leaked = find_leaks(response.text, upstream_names)
    assert not leaked, f"a forged token revealed {len(leaked)} name(s): {leaked}"


def test_counts_survive_so_the_product_still_works(frontend):
    """Assert redaction keeps the signal — counts and grant ids remain.

    Takes: frontend — the proxy client.
    Gives: nothing; fails if redaction emptied the payload entirely.
    """
    response = frontend.post("/api/partnerships", json=SUBJECT, timeout=SLOW_TIMEOUT)
    body = response.json()
    assert body.get("_redacted") is True, "response should declare that it was redacted"
    assert len(response.text) > 500, "redaction should not empty the payload"


# ---------------------------------------------------------------------------
# The sector route (/api/run-pipeline) relays the SAME backend that names PIs,
# and originally did so verbatim — the confirmed breach. These assert it now
# goes through the shared redaction chokepoint like the partnerships route.
# ---------------------------------------------------------------------------

SECTOR = {"sector": "Pharmaceuticals"}


@pytest.fixture(scope="module")
def sector_upstream_names(backend) -> set:
    """Harvest investigator names from the backend's raw sector report.

    Takes: backend — the FastAPI client.
    Gives: the set of personal names present upstream; skips if none exist.
    """
    response = backend.post("/run-pipeline", json=SECTOR, timeout=SLOW_TIMEOUT * 4)
    if response.status_code != 200:
        pytest.skip(f"backend returned {response.status_code} for the sector scan")
    names = set()
    harvest_names(response.json(), names)
    real = {n for n in names if looks_like_a_person(n)}
    if not real:
        pytest.skip("backend sector report returned no personal names")
    return real


def test_sector_report_leaks_no_names_to_anonymous(frontend, sector_upstream_names):
    """Assert the sector route strips names for an unauthenticated caller.

    Takes: frontend — the proxy client; sector_upstream_names — names upstream.
    Gives: nothing; fails listing any name that survived, including in prose.
    """
    response = frontend.post("/api/run-pipeline", json=SECTOR, timeout=SLOW_TIMEOUT * 4)
    assert response.status_code == 200, f"proxy returned {response.status_code}"
    assert response.json().get("_redacted") is True

    leaked = find_leaks(response.text, sector_upstream_names)
    assert not leaked, (
        f"{len(leaked)} investigator name(s) leaked via the sector route: {leaked}. "
        "The free-text scrub in map/lib/redactPeople.ts must catch these."
    )
