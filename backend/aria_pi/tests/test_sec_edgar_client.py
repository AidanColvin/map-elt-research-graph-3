"""Tests for the SEC EDGAR client.

Network calls are mocked. Covers ticker-map loading/caching, CIK resolution
(exact match vs. weak-substring rejection), public/private company facts,
XBRL financial extraction, full-text discovery ranking, and the DEF 14A
proxy / website UNC-alumni parsing.
"""
from unittest.mock import patch

import pytest

from aria_pi.clients import sec_edgar_client as sec_mod
from aria_pi.clients.sec_edgar_client import (
    SECEdgarClient,
    _active_cik_titles,
    _filing_url,
    _strip_proxy_html,
    _parse_proxy_for_unc,
    _proxy_unc_degree,
)
# Ticker loading + its cache moved to the shared aria_pi.lib.tickers module.
from aria_pi.lib.tickers import load_tickers
from aria_pi.tests.conftest import FakeResponse


TICKER_MAP = {
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corp"},
    "2": {"cik_str": 1318605, "ticker": "TSLA", "title": "Tesla, Inc."},
}


# ── Ticker map loading + caching ─────────────────────────────────────────────

def test_load_tickers_parses_dict_values():
    """
    Takes: SEC's company_tickers.json (dict-of-dicts).
    Does: Loads the ticker map.
    Returns: A list of the inner records.
    """
    with patch("aria_pi.lib.tickers.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        tickers = load_tickers()
    assert len(tickers) == 3
    assert {t["ticker"] for t in tickers} == {"AAPL", "MSFT", "TSLA"}


def test_load_tickers_caches_after_first_call():
    """
    Takes: A first successful load, then a second call.
    Does: Loads tickers twice.
    Returns: Only one HTTP request (result cached at module level).
    """
    with patch("aria_pi.lib.tickers.requests.get",
               return_value=FakeResponse(TICKER_MAP)) as mock_get:
        load_tickers()
        load_tickers()
    assert mock_get.call_count == 1


def test_load_tickers_network_error_returns_empty():
    """
    Takes: A failing ticker request.
    Does: Loads tickers.
    Returns: An empty list (cached) without raising.
    """
    with patch("aria_pi.lib.tickers.requests.get",
               side_effect=RuntimeError("dns")):
        assert load_tickers() == []


def test_active_cik_titles_maps_int_cik_to_title():
    """
    Takes: The loaded ticker map.
    Does: Builds the active CIK->title index.
    Returns: int CIK keys mapping to official titles.
    """
    with patch("aria_pi.lib.tickers.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        active = _active_cik_titles()
    assert active[320193] == "Apple Inc."
    assert active[1318605] == "Tesla, Inc."


# ── CIK resolution ───────────────────────────────────────────────────────────

def test_find_cik_exact_ticker_match():
    """
    Takes: A query equal to a ticker symbol.
    Does: Resolves the CIK from the ticker map.
    Returns: The matching CIK as a string.
    """
    client = SECEdgarClient()
    with patch("aria_pi.lib.tickers.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        assert client._find_cik("AAPL") == "320193"


def test_find_cik_exact_title_match():
    """
    Takes: A query equal to a company title.
    Does: Resolves the CIK.
    Returns: The matching CIK.
    """
    client = SECEdgarClient()
    with patch("aria_pi.lib.tickers.requests.get",
               return_value=FakeResponse(TICKER_MAP)):
        assert client._find_cik("Microsoft Corp") == "789019"


def test_find_cik_rejects_weak_substring_then_falls_back_to_search():
    """
    Takes: A private name ('OpenAI') that only weakly matches public titles.
    Does: Resolves CIK; the ticker-map score is too low so it hits full-text
          search, which here returns no token-overlapping hit.
    Returns: None — never a wrong public company.
    """
    client = SECEdgarClient()
    # ticker load, then full-text search returns an unrelated filer
    search_resp = FakeResponse({"hits": {"hits": [
        {"_source": {"ciks": ["320193"]}}  # Apple — shares no token with OpenAI
    ]}})
    # Ticker map loads via lib.tickers; the full-text search hits sec_edgar_client.
    with patch("aria_pi.lib.tickers.requests.get",
               return_value=FakeResponse(TICKER_MAP)), \
         patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=search_resp):
        assert client._find_cik("OpenAI") is None


# ── get_company_facts ────────────────────────────────────────────────────────

def test_get_company_facts_private_company():
    """
    Takes: A company that resolves to no CIK.
    Does: Fetches facts.
    Returns: A dict flagged is_public=False, honestly reporting no filings.
    """
    client = SECEdgarClient()
    with patch.object(client, "_find_cik", return_value=None):
        facts = client.get_company_facts("Epic Systems")
    assert facts["is_public"] is False
    assert facts["legal_name"] == "Epic Systems"


def test_get_company_facts_public_company_parses_submissions():
    """
    Takes: A CIK plus a mocked submissions payload and empty XBRL.
    Does: Fetches and assembles company facts.
    Returns: is_public True, parsed HQ, tickers, and grouped filings.
    """
    client = SECEdgarClient()
    submissions = {
        "name": "Apple Inc.",
        "sicDescription": "Electronic Computers",
        "tickers": ["AAPL"],
        "exchanges": ["Nasdaq"],
        "addresses": {"business": {"city": "Cupertino", "stateOrCountry": "CA"}},
        "filings": {"recent": {
            "form": ["10-K", "8-K"],
            "filingDate": ["2024-11-01", "2024-10-01"],
            "accessionNumber": ["0000320193-24-000123", "0000320193-24-000100"],
            "primaryDocument": ["aapl.htm", "ev.htm"],
        }},
    }
    with patch.object(client, "_find_cik", return_value="320193"), \
         patch.object(client, "_get_xbrl_facts", return_value={}), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get",
               return_value=FakeResponse(submissions)):
        facts = client.get_company_facts("Apple")
    assert facts["is_public"] is True
    assert facts["legal_name"] == "Apple Inc."
    assert facts["hq"] == "Cupertino, CA"
    assert facts["tickers"] == ["AAPL"]
    assert len(facts["filings_by_form"]["10-K"]) == 1
    assert "edgar_url" in facts


def test_get_company_facts_submissions_error_returns_minimal():
    """
    Takes: A CIK but a submissions endpoint that errors.
    Does: Fetches facts.
    Returns: A minimal dict with the CIK and SEC source, no exception.
    """
    client = SECEdgarClient()
    with patch.object(client, "_find_cik", return_value="320193"), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get",
               side_effect=RuntimeError("503")):
        facts = client.get_company_facts("Apple")
    assert facts["cik"] == "320193"
    assert facts["source"] == "https://www.sec.gov"


# ── XBRL parsing ─────────────────────────────────────────────────────────────

def test_get_xbrl_facts_picks_latest_annual_revenue():
    """
    Takes: Company-facts XBRL with two revenue concepts across fiscal years.
    Does: Extracts headline financials.
    Returns: The most recent annual revenue value, plus a built series.
    """
    client = SECEdgarClient()
    companyfacts = {"facts": {"us-gaap": {
        "SalesRevenueNet": {"units": {"USD": [
            {"val": 100, "end": "2018-12-31", "fy": 2018, "fp": "FY",
             "form": "10-K", "accn": "0000320193-19-000001"},
        ]}},
        "RevenueFromContractWithCustomerExcludingAssessedTax": {"units": {"USD": [
            {"val": 400, "end": "2023-12-31", "fy": 2023, "fp": "FY",
             "form": "10-K", "accn": "0000320193-24-000001"},
        ]}},
        "ResearchAndDevelopmentExpense": {"units": {"USD": [
            {"val": 25, "end": "2023-12-31", "fy": 2023, "fp": "FY",
             "form": "10-K", "accn": "0000320193-24-000001"},
        ]}},
    }, "dei": {}}}
    with patch("aria_pi.clients.sec_edgar_client.requests.Session.get",
               return_value=FakeResponse(companyfacts)):
        xbrl = client._get_xbrl_facts("320193")
    assert xbrl["revenue"]["value"] == 400      # 2023 beats 2018
    assert xbrl["revenue"]["fy"] == 2023
    assert xbrl["rd_expense"]["value"] == 25
    # Series merges both revenue concepts, deduped + ascending by fiscal year.
    fys = [pt["fy"] for pt in xbrl["series"]["revenue"]]
    assert fys == sorted(fys)
    assert 2018 in fys and 2023 in fys


def test_get_xbrl_facts_network_error_returns_empty():
    """
    Takes: A failing company-facts request.
    Does: Pulls XBRL facts.
    Returns: An empty dict.
    """
    client = SECEdgarClient()
    with patch("aria_pi.clients.sec_edgar_client.requests.Session.get",
               side_effect=RuntimeError("nope")):
        assert client._get_xbrl_facts("320193") == {}


# ── Discovery ranking ────────────────────────────────────────────────────────

def test_discover_companies_ranks_by_frequency():
    """
    Takes: A term and full-text hits where one live filer matches twice.
    Does: Runs discovery (active map + one efts page).
    Returns: Live companies ranked by match frequency, capped at limit.
    """
    client = SECEdgarClient()
    hits = {"hits": {"hits": [
        {"_source": {"ciks": ["320193"]}},
        {"_source": {"ciks": ["320193"]}},   # Apple twice
        {"_source": {"ciks": ["789019"]}},   # Microsoft once
        {"_source": {"ciks": ["999999"]}},   # not in active map -> dropped
    ]}}

    def fake_get(url, **kwargs):
        if "company_tickers" in url:
            return FakeResponse(TICKER_MAP)
        return FakeResponse(hits)

    # Ticker fetch routes through lib.tickers (module requests.get); the efts
    # search routes through the client's requests.Session.
    with patch("aria_pi.lib.tickers.requests.get", side_effect=fake_get), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get",
               side_effect=fake_get), \
         patch("aria_pi.clients.sec_edgar_client.time.sleep"):
        names = client.discover_companies("computers", limit=10)
    assert names[0] == "Apple Inc."          # highest frequency first
    assert "Microsoft Corp" in names
    assert all("999999" not in n for n in names)


def test_discover_companies_blank_term_returns_empty():
    """
    Takes: An empty term.
    Does: Runs discovery.
    Returns: An empty list with no HTTP calls.
    """
    client = SECEdgarClient()
    assert client.discover_companies("   ") == []


# ── _filing_url ──────────────────────────────────────────────────────────────

def test_filing_url_variants():
    """
    Takes: Accession + document combinations.
    Does: Builds the canonical filing URL.
    Returns: A document URL, a directory URL, or the browse-edgar fallback.
    """
    assert _filing_url("320193", "", "") == \
        "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=320193"
    doc = _filing_url("320193", "0000320193-24-000123", "aapl.htm")
    assert doc.endswith("/000032019324000123/aapl.htm")
    folder = _filing_url("320193", "0000320193-24-000123", "")
    assert folder.endswith("/000032019324000123/")


# ── Proxy / website UNC alumni parsing ───────────────────────────────────────

def test_strip_proxy_html_preserves_paragraph_boundaries():
    """
    Takes: HTML with block elements and a script tag.
    Does: Strips HTML while keeping structure.
    Returns: Script content gone; block elements split onto separate lines.
    """
    html = "<div>John Smith</div><script>x=1</script><p>UNC bio</p>"
    out = _strip_proxy_html(html)
    assert "x=1" not in out
    assert "John Smith" in out
    assert "UNC bio" in out
    assert "\n" in out


def test_proxy_unc_degree_detection():
    """
    Takes: Bio context strings mentioning different degrees.
    Does: Classifies the highest/relevant degree label.
    Returns: The matched degree label or empty string.
    """
    assert _proxy_unc_degree("earned a Ph.D. from UNC") == "PhD"
    assert _proxy_unc_degree("holds an MBA") == "MBA"
    assert _proxy_unc_degree("no degree mentioned") == ""


def test_parse_proxy_for_unc_extracts_person():
    """
    Takes: A proxy bio naming an exec, age, title, and a UNC degree.
    Does: Parses the document for UNC-educated people.
    Returns: One record with name, title, and UNC credential.
    """
    html = (
        "<p>Jane M. Doe, age 54</p>"
        "<p>Chief Executive Officer</p>"
        "<p>Ms. Doe received a B.S. from the University of North Carolina "
        "at Chapel Hill.</p>"
    )
    people = _parse_proxy_for_unc(html, "https://sec.gov/doc.htm")
    assert len(people) == 1
    assert people[0]["name"] == "Jane M. Doe"
    assert "UNC Chapel Hill" in people[0]["unc_credential"]
    assert people[0]["source_url"] == "https://sec.gov/doc.htm"


def test_parse_proxy_for_unc_requires_education_context():
    """
    Takes: A UNC mention with no educational keyword nearby.
    Does: Parses the document.
    Returns: An empty list — a bare UNC mention is not an alumnus claim.
    """
    html = "<p>The company sponsors University of North Carolina athletics.</p>"
    assert _parse_proxy_for_unc(html, "u") == []


def test_get_unc_alumni_from_proxy_skips_when_no_filings():
    """
    Takes: A CIK but no proxy filings.
    Does: Requests alumni from proxy.
    Returns: An empty list without any HTTP work.
    """
    client = SECEdgarClient()
    assert client.get_unc_alumni_from_proxy("320193", []) == []


def test_get_unc_alumni_from_website_skips_js_shell():
    """
    Takes: A leadership URL whose body is a near-empty JS shell.
    Does: Scrapes the website for UNC alumni.
    Returns: An empty list (text below the visible-content threshold).
    """
    client = SECEdgarClient()
    shell = FakeResponse(text="<html><body></body></html>", status_code=200)
    with patch("aria_pi.clients.sec_edgar_client.requests.get",
               return_value=shell):
        assert client.get_unc_alumni_from_website("Acme", "https://acme.com") == []


def test_latest_annual_prefers_full_year_over_latest_quarter():
    """
    Takes: XBRL where one revenue concept has only quarterly 10-Q facts and
           another carries the genuine 10-K full-year fact with an older end.
    Does: Assembles company facts.
    Returns: the FULL-YEAR value as revenue — never the more recent quarter
             (EA's $2.0B Q1 was reported as its "annual" revenue before this).
    """
    client = SECEdgarClient()
    xbrl_payload = {"facts": {"us-gaap": {
        "Revenues": {"units": {"USD": [
            {"val": 2_000_000_000, "start": "2025-04-01", "end": "2025-06-30",
             "form": "10-Q", "fp": "Q1", "fy": 2026, "accn": "0000000000-25-000002"},
        ]}},
        "RevenueFromContractWithCustomerExcludingAssessedTax": {"units": {"USD": [
            {"val": 7_500_000_000, "start": "2024-04-01", "end": "2025-03-31",
             "form": "10-K", "fp": "FY", "fy": 2025, "accn": "0000000000-25-000001"},
            # Quarterly comparative INSIDE the 10-K: same form/fp, short span.
            {"val": 1_900_000_000, "start": "2025-01-01", "end": "2025-03-31",
             "form": "10-K", "fp": "FY", "fy": 2025, "accn": "0000000000-25-000001"},
        ]}},
    }}}
    submissions = {
        "name": "Electronic Arts Inc.",
        "tickers": ["EA"],
        "filings": {"recent": {"form": [], "filingDate": [],
                               "accessionNumber": [], "primaryDocument": []}},
    }

    def fake_get(self, url, **kwargs):
        return FakeResponse(xbrl_payload if "companyfacts" in url else submissions)

    with patch.object(client, "_find_cik", return_value="712515"), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get", new=fake_get):
        facts = client.get_company_facts("Electronic Arts")
    assert facts["xbrl"]["revenue"]["value"] == 7_500_000_000
    assert facts["xbrl"]["revenue"]["end"] == "2025-03-31"


def test_annual_series_never_mixes_overlapping_concepts():
    """
    Takes: two revenue concepts that OVERLAP in FY2023 with different values
           (total revenue vs contract-only, the Pfizer shape).
    Does: builds the annual series.
    Returns: FY2023 from the concept that reaches the newest fiscal year —
             never the stale concept's value — while non-overlapping early
             years still merge in (the Apple concept-handoff shape).
    """
    client = SECEdgarClient()
    xbrl = {"facts": {"us-gaap": {
        "Revenues": {"units": {"USD": [
            {"val": 90, "start": "2017-01-01", "end": "2017-12-31",
             "form": "10-K", "fp": "FY", "fy": 2017, "accn": "a1"},
            {"val": 100, "start": "2023-01-01", "end": "2023-12-31",
             "form": "10-K", "fp": "FY", "fy": 2023, "accn": "a2"},
        ]}},
        "RevenueFromContractWithCustomerExcludingAssessedTax": {"units": {"USD": [
            {"val": 51, "start": "2023-01-01", "end": "2023-12-31",
             "form": "10-K", "fp": "FY", "fy": 2023, "accn": "a3"},
            {"val": 60, "start": "2024-01-01", "end": "2024-12-31",
             "form": "10-K", "fp": "FY", "fy": 2024, "accn": "a4"},
        ]}},
    }}}
    submissions = {"name": "X", "tickers": [],
                   "filings": {"recent": {"form": [], "filingDate": [],
                                          "accessionNumber": [], "primaryDocument": []}}}

    def fake_get(self, url, **kwargs):
        return FakeResponse(xbrl if "companyfacts" in url else submissions)

    with patch.object(client, "_find_cik", return_value="1"), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get", new=fake_get):
        facts = client.get_company_facts("X")
    series = {pt["fy"]: pt["val"] for pt in facts["xbrl"]["series"]["revenue"]}
    # FY2023 must come from the newest-reaching concept (51), not mix in 100…
    assert series[2023] == 51 and series[2024] == 60
    # …while the old concept still fills the year it alone covers.
    assert series[2017] == 90


def test_find_cik_tie_prefers_cap_ranked_flagship_over_spinoff():
    """
    Takes: a ticker map where the flagship and a same-name spinoff both match
           the query with equal score and equally many extra tokens, with the
           flagship EARLIER in SEC's (market-cap ordered) map.
    Does: resolves the bare brand name.
    Returns: the flagship's CIK — not the spinoff the old shorter-title
             tiebreak used to pick ("Honeywell" → Honeywell Aerospace Inc).
    """
    client = SECEdgarClient()
    tickers = [
        {"cik_str": 773840, "ticker": "HON", "title": "HONEYWELL INTERNATIONAL INC"},
        {"cik_str": 999999, "ticker": "HONA", "title": "Honeywell Aerospace Inc"},
    ]
    with patch("aria_pi.clients.sec_edgar_client.load_tickers", return_value=tickers):
        assert client._find_cik("Honeywell") == "773840"


def test_annual_series_trusts_self_reported_fy_for_jan_ending_companies():
    """
    Takes: a Jan-31-fiscal-year-end company (Salesforce's real shape) whose
           XBRL self-reports fy=2025 for the period ENDING 2025-01-31 — i.e.
           the END-YEAR naming convention (also used by Walmart, NVIDIA).
    Does: builds the annual series.
    Returns: the point stays labeled FY2025 — NOT shifted back to FY2024. A
             blanket "Jan/Feb end → prior year" rule (built for Target/Lowe's,
             which use the OPPOSITE start-year convention) shipped and
             mislabeled this exact shape before being caught.
    """
    client = SECEdgarClient()
    xbrl = {"facts": {"us-gaap": {
        "Revenues": {"units": {"USD": [
            {"val": 34_900_000_000, "start": "2023-02-01", "end": "2024-01-31",
             "form": "10-K", "fp": "FY", "fy": 2024, "accn": "a1"},
            {"val": 37_900_000_000, "start": "2024-02-01", "end": "2025-01-31",
             "form": "10-K", "fp": "FY", "fy": 2025, "accn": "a2"},
        ]}},
    }}}
    submissions = {"name": "Salesforce, Inc.", "tickers": ["CRM"],
                   "filings": {"recent": {"form": [], "filingDate": [],
                                          "accessionNumber": [], "primaryDocument": []}}}

    def fake_get(self, url, **kwargs):
        return FakeResponse(xbrl if "companyfacts" in url else submissions)

    with patch.object(client, "_find_cik", return_value="1108524"), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get", new=fake_get):
        facts = client.get_company_facts("Salesforce")
    series = {pt["fy"]: pt["val"] for pt in facts["xbrl"]["series"]["revenue"]}
    assert series[2025] == 37_900_000_000
    assert series[2024] == 34_900_000_000


def test_annual_series_resolves_same_fy_collision_without_dropping_a_year():
    """
    Takes: two facts under one concept that self-report the IDENTICAL fy but
           whose end dates are over a year apart — the actual LabCorp entity-
           swap symptom (a holdco reorg mistagged a comparative period).
    Does: builds the annual series.
    Returns: both periods survive as distinct points (the newer one re-homed
             to its own calendar year) instead of one silently overwriting
             the other and dropping a year from the chart.
    """
    client = SECEdgarClient()
    xbrl = {"facts": {"us-gaap": {
        "Revenues": {"units": {"USD": [
            {"val": 14_900_000_000, "start": "2021-01-01", "end": "2021-12-31",
             "form": "10-K", "fp": "FY", "fy": 2021, "accn": "a1"},
            # Collides on fy=2021 but is really the FY2022 period.
            {"val": 12_200_000_000, "start": "2022-01-01", "end": "2022-12-31",
             "form": "10-K", "fp": "FY", "fy": 2021, "accn": "a2"},
        ]}},
    }}}
    submissions = {"name": "LabCorp Holdings Inc.", "tickers": ["LH"],
                   "filings": {"recent": {"form": [], "filingDate": [],
                                          "accessionNumber": [], "primaryDocument": []}}}

    def fake_get(self, url, **kwargs):
        return FakeResponse(xbrl if "companyfacts" in url else submissions)

    with patch.object(client, "_find_cik", return_value="1"), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get", new=fake_get):
        facts = client.get_company_facts("LabCorp")
    series = {pt["fy"]: pt["val"] for pt in facts["xbrl"]["series"]["revenue"]}
    assert series[2021] == 14_900_000_000
    assert series[2022] == 12_200_000_000


def test_annual_series_shifts_confirmed_start_year_retailers():
    """
    Takes: Target's CIK (27419, a confirmed start-year fiscal namer) with an
           XBRL fact self-reporting fy=2023 for the period ending 2023-01-28
           — Target's own investor-relations page calls that period "fiscal
           2022" ($109.1B), not "fiscal 2023".
    Does: builds the annual series.
    Returns: the point is labeled FY2022, matching Target's own convention —
             not the raw self-reported XBRL fy.
    """
    client = SECEdgarClient()
    xbrl = {"facts": {"us-gaap": {
        "RevenueFromContractWithCustomerExcludingAssessedTax": {"units": {"USD": [
            {"val": 109_120_000_000, "start": "2022-01-30", "end": "2023-01-28",
             "form": "10-K", "fp": "FY", "fy": 2023, "accn": "a1"},
        ]}},
    }}}
    submissions = {"name": "Target Corporation", "tickers": ["TGT"],
                   "filings": {"recent": {"form": [], "filingDate": [],
                                          "accessionNumber": [], "primaryDocument": []}}}

    def fake_get(self, url, **kwargs):
        return FakeResponse(xbrl if "companyfacts" in url else submissions)

    with patch.object(client, "_find_cik", return_value="27419"), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get", new=fake_get):
        facts = client.get_company_facts("Target")
    series = {pt["fy"]: pt["val"] for pt in facts["xbrl"]["series"]["revenue"]}
    assert series[2022] == 109_120_000_000
    assert 2023 not in series


def test_annual_series_handles_targets_duplicated_self_reported_fy():
    """
    Takes: Target's ACTUAL XBRL shape — self-reported fy=2018 duplicated
           across TWO genuinely different periods (ending 2017-01-28 and
           2018-02-03), confirmed live against the real SEC data. Naively
           adjusting the duplicated fy (fy - 1) just moves the collision:
           both facts would still land on the same computed fy and the
           "genuine collision" fallback would re-home one of them WITHOUT
           the retailer shift, silently reverting to the wrong label — the
           actual bug this test catches.
    Does: builds the annual series.
    Returns: both periods survive as DISTINCT, correctly-shifted years
             (FY2016 and FY2017) — no collision, no dropped year, no
             unshifted fallback label.
    """
    client = SECEdgarClient()
    xbrl = {"facts": {"us-gaap": {
        "Revenues": {"units": {"USD": [
            {"val": 70_271_000_000, "start": "2016-01-31", "end": "2017-01-28",
             "form": "10-K", "fp": "FY", "fy": 2018, "accn": "a1"},
            {"val": 72_714_000_000, "start": "2017-01-29", "end": "2018-02-03",
             "form": "10-K", "fp": "FY", "fy": 2018, "accn": "a2"},
        ]}},
    }}}
    submissions = {"name": "Target Corporation", "tickers": ["TGT"],
                   "filings": {"recent": {"form": [], "filingDate": [],
                                          "accessionNumber": [], "primaryDocument": []}}}

    def fake_get(self, url, **kwargs):
        return FakeResponse(xbrl if "companyfacts" in url else submissions)

    with patch.object(client, "_find_cik", return_value="27419"), \
         patch("aria_pi.clients.sec_edgar_client.requests.Session.get", new=fake_get):
        facts = client.get_company_facts("Target")
    series = {pt["fy"]: pt["val"] for pt in facts["xbrl"]["series"]["revenue"]}
    assert series[2016] == 70_271_000_000
    assert series[2017] == 72_714_000_000
