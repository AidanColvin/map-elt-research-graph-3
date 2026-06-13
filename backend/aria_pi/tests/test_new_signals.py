"""Tests for the four company-profile data signals.

Covers: 8-K collaboration history (EDGAR FTS), UNC PI extraction from NIH
grants, the PatentsView client's safe defaults and summarization, and the
10-K partnership-language scoring.
"""
from unittest.mock import patch

from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.nih_reporter_client import unc_pis_from_grants
from aria_pi.clients.patents import fetch_patents, _summarize, _name_variants, EMPTY
from aria_pi.builders.report_builder import ReportBuilder, _partnership_language
from aria_pi.tests.conftest import FakeResponse


# ── Signal 1: 8-K collaboration history ─────────────────────────────────────

def _efts_hit(adsh, fdate, fname="doc.htm", desc="EX-10.1"):
    return {"_id": f"{adsh}:{fname}",
            "_source": {"adsh": adsh, "file_date": fdate,
                        "file_description": desc, "ciks": ["0000310158"]}}


def test_fetch_collaboration_8ks_merges_and_dedupes():
    """
    Takes: Two efts queries whose hits share one accession number.
    Does: Fetches the collaboration 8-K record.
    Returns: Distinct count and the most recent filing's date/URL.
    """
    page1 = {"hits": {"hits": [_efts_hit("0001-25-1", "2025-03-01"),
                               _efts_hit("0001-25-2", "2025-06-15")]}}
    page2 = {"hits": {"hits": [_efts_hit("0001-25-2", "2025-06-15"),
                               _efts_hit("0001-25-3", "2024-11-30")]}}
    client = SECEdgarClient()
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               side_effect=[FakeResponse(page1), FakeResponse(page2)]), \
         patch("aria_pi.clients.sec_edgar_client.time.sleep"):
        out = client.fetch_collaboration_8ks("310158")
    assert out["collaboration_8k_count"] == 3
    assert out["most_recent_8k_date"] == "2025-06-15"
    assert "sec.gov/Archives/edgar/data/310158" in out["collaboration_8k_url"]


def test_fetch_collaboration_8ks_safe_defaults():
    """
    Takes: A missing CIK and a network failure.
    Does: Fetches the collaboration record in both cases.
    Returns: Zero/None defaults — never raises.
    """
    client = SECEdgarClient()
    empty = {"collaboration_8k_count": 0, "most_recent_8k_date": None,
             "most_recent_8k_description": None, "collaboration_8k_url": None}
    assert client.fetch_collaboration_8ks("") == empty
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               side_effect=RuntimeError("down")), \
         patch("aria_pi.clients.sec_edgar_client.time.sleep"):
        assert client.fetch_collaboration_8ks("310158") == empty


# ── Signal 2: UNC PI extraction ──────────────────────────────────────────────

def test_unc_pis_from_grants_filters_dedupes_limits():
    """
    Takes: Grants with UNC and non-UNC orgs, including a duplicate PI.
    Does: Extracts named UNC contacts.
    Returns: Only UNC-affiliated PIs, deduped, capped at 3.
    """
    g = lambda pi, org, i: {"pi": pi, "organization": org,
                            "title": f"P{i}", "url": f"u{i}"}
    grants = [g("Jane Doe", "UNIV OF NORTH CAROLINA CHAPEL HILL", 1),
              g("Jane Doe", "UNC Chapel Hill", 2),
              g("Bob Roe", "Duke University", 3),
              g("Amy Wu", "UNC Lineberger", 4),
              g("Cal Lee", "University of North Carolina", 5),
              g("Dee Im", "UNC Gillings", 6)]
    pis = unc_pis_from_grants(grants)
    assert [p["name"] for p in pis] == ["Jane Doe", "Amy Wu", "Cal Lee"]
    assert pis[0]["project_title"] == "P1" and pis[0]["grant_url"] == "u1"
    assert unc_pis_from_grants([]) == []
    assert unc_pis_from_grants(None) == []


# ── Signal 3: PatentsView ────────────────────────────────────────────────────

def test_fetch_patents_safe_defaults_when_unreachable():
    """
    Takes: A network where every patent endpoint fails.
    Does: Fetches patents.
    Returns: Zero-count defaults — never raises.
    """
    with patch("aria_pi.clients.patents.requests.get",
               side_effect=RuntimeError("down")), \
         patch("aria_pi.clients.patents.requests.post",
               side_effect=RuntimeError("down")):
        assert fetch_patents("Pfizer Inc") == EMPTY
    assert fetch_patents("") == EMPTY


def test_patents_summarize_and_name_variants():
    """
    Takes: Raw patent rows and a suffixed legal name.
    Does: Summarizes counts/recency/categories and builds name variants.
    Returns: Correct counts, top categories by frequency, full+short names.
    """
    rows = [
        {"patent_date": "2026-01-01",
         "cpc_current": [{"cpc_group_title": "Antibodies"}]},
        {"patent_date": "2025-06-01",
         "cpc_current": [{"cpc_group_title": "Antibodies"}]},
        {"patent_date": "2010-01-01",
         "cpc_current": [{"cpc_group_title": "Polymers"}]},
    ]
    s = _summarize(rows)
    assert s["patent_count"] == 3
    assert s["recent_patent_count"] == 2
    assert s["top_categories"][0] == "Antibodies"
    assert _name_variants("Pfizer Inc") == ["Pfizer Inc", "Pfizer"]
    assert _name_variants("Anthropic") == ["Anthropic"]


# ── Signal 4: 10-K partnership language ──────────────────────────────────────

def test_partnership_language_thresholds_and_overlap():
    """
    Takes: Texts at each classification threshold.
    Does: Scores partnership language.
    Returns: None under 5 hits, moderate 5-14, strong 15+, and 'licensing'
             not double-counted under 'license'.
    """
    assert _partnership_language("") == (None, 0, None, 0)
    assert _partnership_language("collaboration " * 4)[0] is None
    label, total, top, n = _partnership_language("university " * 6)
    assert (label, total, top, n) == ("moderate", 6, "university", 6)
    label, total, top, n = _partnership_language("alliance " * 15)
    assert (label, total) == ("strong", 15)
    # "licensing" contains "license" — counted once, under "licensing".
    _, total, top, _ = _partnership_language("licensing " * 7)
    assert total == 7 and top == "licensing"


# ── Builder integration ──────────────────────────────────────────────────────

def test_profile_carries_all_four_signal_fields():
    """
    Takes: A company with data for all four signals.
    Does: Builds its profile.
    Returns: All new fields present and all four text inserts in overview.
    """
    builder = ReportBuilder()
    company = {
        "name": "TestCo",
        "facts": {"legal_name": "TestCo Inc", "cik": "1", "xbrl": {}},
        "trials": [], "unc_trials": [], "pubmed": [], "pubmed_coi": [],
        "unc_alumni": [],
        "nih_grants": [{"pi": "Jane Doe", "organization": "UNC Chapel Hill",
                        "title": "Grant T", "url": "https://reporter.nih.gov/x"}],
        "collab_8ks": {"collaboration_8k_count": 2,
                       "most_recent_8k_date": "2025-06-15",
                       "most_recent_8k_description": "EX-10.1",
                       "collaboration_8k_url": "https://www.sec.gov/x"},
        "patents": {"patent_count": 12, "recent_patent_count": 5,
                    "top_categories": ["Antibodies"],
                    "patents_url": "https://search.patentsview.org/?q=TestCo"},
        "tenk_text": "collaboration " * 20,
    }
    p = builder._profile(company, {}, set())
    assert p["collaboration_8k_count"] == 2
    assert p["unc_pis"][0]["name"] == "Jane Doe"
    assert p["patent_count"] == 12 and p["top_categories"] == ["Antibodies"]
    assert p["partnership_language"] == "strong"
    assert p["partnership_term_count"] == 20
    text = p["overview"]["text"]
    for marker in ("Deal track record", "Potential UNC contacts",
                   "IP portfolio", "Partnership language"):
        assert marker in text


def test_profile_inserts_nothing_when_signals_absent():
    """
    Takes: A company with no signal data.
    Does: Builds its profile.
    Returns: Safe defaults and none of the four text markers.
    """
    builder = ReportBuilder()
    company = {"name": "Quiet Co", "facts": {"legal_name": "Quiet Co"},
               "trials": [], "unc_trials": [], "pubmed": [], "pubmed_coi": [],
               "nih_grants": [], "unc_alumni": []}
    p = builder._profile(company, {}, set())
    assert p["collaboration_8k_count"] == 0
    assert p["unc_pis"] == [] and p["patent_count"] == 0
    assert p["partnership_language"] is None
    assert p["partnership_term_count"] == 0
    text = p["overview"]["text"]
    for marker in ("Deal track record", "Potential UNC contacts",
                   "IP portfolio", "Partnership language"):
        assert marker not in text
