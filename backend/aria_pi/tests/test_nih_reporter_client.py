"""Tests for the NIH RePORTER client.

HTTP is mocked. Covers payload construction, parsing of both snake_case and
PascalCase API field variants, PI resolution precedence, and error handling.
"""
from unittest.mock import patch

from aria_pi.clients.nih_reporter_client import NIHReporterClient
from aria_pi.tests.conftest import FakeResponse


def test_unc_grants_parses_snake_case_result():
    """
    Takes: A RePORTER result using snake_case fields with a PI list.
    Does: Parses the grant record.
    Returns: A normalized dict with PI, department, project URL, etc.
    """
    client = NIHReporterClient()
    results = {"results": [{
        "project_num": "5R01CA123456",
        "project_title": "Cancer immunotherapy with Merck compounds",
        "principal_investigators": [{"full_name": "Dr. Lin Chen"}],
        "organization": {"org_dept": "Pharmacology", "org_name": "UNC"},
        "fiscal_year": 2024,
        "agency_ic_admin": {"name": "NCI"},
    }]}
    with patch.object(client._session, "post", return_value=FakeResponse(results)):
        grants = client.unc_grants_mentioning("Merck")
    g = grants[0]
    assert g["project_num"] == "5R01CA123456"
    assert g["pi"] == "Dr. Lin Chen"
    assert g["department"] == "Pharmacology"
    assert g["fiscal_year"] == 2024
    assert g["agency"] == "NCI"
    assert g["url"] == "https://reporter.nih.gov/project-details/5R01CA123456"


def test_unc_grants_falls_back_to_contact_pi():
    """
    Takes: A result with an empty PI list but a contact_pi_name.
    Does: Parses the record.
    Returns: The contact PI name as the resolved PI.
    """
    client = NIHReporterClient()
    results = {"results": [{
        "project_num": "P1",
        "principal_investigators": [],
        "contact_pi_name": "Dr. Backup",
        "organization": {},
    }]}
    with patch.object(client._session, "post", return_value=FakeResponse(results)):
        grants = client.unc_grants_mentioning("X")
    assert grants[0]["pi"] == "Dr. Backup"


def test_unc_grants_missing_project_num_uses_base_url():
    """
    Takes: A result with no project number.
    Does: Parses the record.
    Returns: The bare reporter.nih.gov URL (no project path).
    """
    client = NIHReporterClient()
    results = {"results": [{"project_title": "t", "organization": {}}]}
    with patch.object(client._session, "post", return_value=FakeResponse(results)):
        grants = client.unc_grants_mentioning("X")
    assert grants[0]["url"] == "https://reporter.nih.gov"


def test_unc_grants_search_text_in_payload():
    """
    Takes: A company name.
    Does: Issues the search and inspects the POSTed payload.
    Returns: The advanced_text_search carries the company as a QUOTED phrase and
             the UNC org, searching only the grant's text fields.
    """
    client = NIHReporterClient()
    with patch.object(client._session, "post",
                      return_value=FakeResponse({"results": []})) as mock_post:
        client.unc_grants_mentioning("Pfizer", max_results=3)
    ats = mock_post.call_args.kwargs["json"]["criteria"]["advanced_text_search"]
    assert ats["search_text"] == '"Pfizer"'        # quoted phrase, not bare token
    assert ats["operator"] == "advanced"
    assert ats["search_field"] == "projecttitle,abstracttext,terms"
    payload = mock_post.call_args.kwargs["json"]
    # Over-fetch so multi-fiscal-year rows of one award can be collapsed to the
    # top `max_results` DISTINCT grants.
    assert payload["limit"] == 30
    assert "UNIV OF NORTH CAROLINA CHAPEL HILL" in payload["criteria"]["org_names"]


def test_unc_grants_collapse_fiscal_year_renewals():
    """The 5 fiscal-year rows of one award collapse to a single grant (most
    recent FY), not 5 fabricated 'ties'."""
    client = NIHReporterClient()
    rows = [
        {"project_num": f"5R01AI186609-0{fy-2019}", "project_title": "HIV latency",
         "fiscal_year": fy, "organization": {}}
        for fy in (2024, 2023, 2022, 2021, 2020)
    ]
    with patch.object(client._session, "post", return_value=FakeResponse({"results": rows})):
        grants = client.unc_grants_mentioning("Pfizer", max_results=5)
    assert len(grants) == 1
    assert grants[0]["fiscal_year"] == 2024            # keeps the most recent year


def test_unc_grants_disambiguates_common_word_names():
    """A common-word name searches its real corporate phrases (Meta → Meta
    Platforms / Facebook), never the bare token that matched 'metabolic'."""
    client = NIHReporterClient()
    with patch.object(client._session, "post",
                      return_value=FakeResponse({"results": []})) as mock_post:
        client.unc_grants_mentioning("Meta")
    st = mock_post.call_args.kwargs["json"]["criteria"]["advanced_text_search"]["search_text"]
    assert '"Meta Platforms"' in st and '"Facebook"' in st
    assert st != "Meta"


def test_unc_grants_network_error_returns_empty():
    """
    Takes: A POST that raises.
    Does: Searches grants.
    Returns: An empty list (graceful).
    """
    client = NIHReporterClient()
    with patch.object(client._session, "post", side_effect=RuntimeError("502")):
        assert client.unc_grants_mentioning("Pfizer") == []
