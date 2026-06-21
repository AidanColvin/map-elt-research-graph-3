"""Tests for the PubMed Entrez client.

All HTTP is mocked — the suite verifies query construction, JSON parsing,
school attribution / dedup, and graceful failure on network errors.
"""
from unittest.mock import patch

import pytest

from aria_pi.clients.pubmed_client import PubMedClient
from aria_pi.utils.affiliation import company_affiliation_regex
from aria_pi.tests.conftest import FakeResponse


def _esearch(ids):
    return FakeResponse({"esearchresult": {"idlist": ids}})


def _esummary(items):
    return FakeResponse({"result": items})


def test_run_parses_papers():
    """
    Takes: A mocked esearch (one id) and esummary (one record).
    Does: Runs the internal _run query and maps the raw record to our schema.
    Returns: One paper dict with pmid, title, authors, journal, year, url.
    """
    client = PubMedClient()
    summary = {
        "12345": {
            "title": "UNC and Pfizer collaboration",
            "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
            "fulljournalname": "Nature Medicine",
            "pubdate": "2023 Mar",
        }
    }
    with patch("aria_pi.clients.pubmed_client.requests.get",
               side_effect=[_esearch(["12345"]), _esummary(summary)]):
        papers = client._run("term", 5)
    assert len(papers) == 1
    p = papers[0]
    assert p["pmid"] == "12345"
    assert p["title"] == "UNC and Pfizer collaboration"
    assert p["authors"] == ["Smith J", "Doe A"]
    assert p["journal"] == "Nature Medicine"
    assert p["year"] == "2023"
    assert p["url"] == "https://pubmed.ncbi.nlm.nih.gov/12345/"


def test_run_empty_idlist_short_circuits():
    """
    Takes: An esearch response with no ids.
    Does: Runs _run; it must not issue an esummary call.
    Returns: An empty list.
    """
    client = PubMedClient()
    with patch("aria_pi.clients.pubmed_client.requests.get",
               side_effect=[_esearch([])]) as mock_get:
        papers = client._run("term", 5)
    assert papers == []
    assert mock_get.call_count == 1  # esummary never called


def test_run_handles_esearch_network_error():
    """
    Takes: An esearch call that raises a network exception.
    Does: Runs _run, which must catch the error rather than propagate it.
    Returns: An empty list (graceful degradation).
    """
    client = PubMedClient()
    with patch("aria_pi.clients.pubmed_client.requests.get",
               side_effect=RuntimeError("connection reset")):
        assert client._run("term", 5) == []


def test_run_handles_esummary_network_error():
    """
    Takes: A good esearch then an esummary that raises.
    Does: Runs _run; the second-stage failure is caught.
    Returns: An empty list.
    """
    client = PubMedClient()
    with patch("aria_pi.clients.pubmed_client.requests.get",
               side_effect=[_esearch(["1"]), RuntimeError("boom")]):
        assert client._run("term", 5) == []


def test_run_truncates_authors_to_four():
    """
    Takes: A summary record with six authors.
    Does: Parses the record.
    Returns: At most the first four author names.
    """
    client = PubMedClient()
    summary = {"9": {"title": "t",
                     "authors": [{"name": f"A{i}"} for i in range(6)],
                     "source": "J", "pubdate": "2020"}}
    with patch("aria_pi.clients.pubmed_client.requests.get",
               side_effect=[_esearch(["9"]), _esummary(summary)]):
        papers = client._run("term", 5)
    assert papers[0]["authors"] == ["A0", "A1", "A2", "A3"]


def test_search_by_unc_schools_tags_and_dedupes():
    """
    Takes: The same pmid returned under two different UNC-school queries.
    Does: Runs the per-school search across all configured schools.
    Returns: One deduped paper tagged with the first school it appeared under.
    """
    client = PubMedClient()

    def fresh_paper(*args, **kwargs):
        # Return a NEW dict each call, mirroring real _run behavior (the client
        # tags each hit with its school via in-place mutation).
        return [{"pmid": "777", "title": "t", "authors": [], "journal": "J",
                 "year": "2021", "url": "u"}]

    with patch.object(client, "_run", side_effect=fresh_paper):
        results = client.search_by_unc_schools("Pfizer", max_per_school=3)
    pmids = [r["pmid"] for r in results]
    assert pmids == ["777"]  # deduped to a single entry
    assert results[0]["unc_school"] == client.UNC_SCHOOLS[0][0]


def test_search_unc_with_company_builds_combined_term():
    """
    Takes: A company name.
    Does: Calls the combined UNC+company search.
    Returns: _run is invoked with a term naming both the company and UNC.
    """
    client = PubMedClient()
    with patch.object(client, "_run", return_value=[]) as mock_run:
        client.search_unc_with_company("Moderna", max_results=8)
    term = mock_run.call_args[0][0]
    assert "Moderna" in term
    assert "University of North Carolina" in term


def test_search_unc_with_company_disambiguates_meta():
    """An ambiguous name queries its real corporate affiliations, not the bare
    token, so 'Meta' can't match 'meta-analysis'/'Meta-Research'."""
    client = PubMedClient()
    with patch.object(client, "_run", return_value=[]) as mock_run:
        client.search_unc_with_company("Meta", max_results=8)
    term = mock_run.call_args[0][0]
    assert '"Meta Platforms"[Affiliation]' in term
    assert '"Facebook"[Affiliation]' in term


def test_verify_coauthorship_keeps_real_pair_and_names_unc_author():
    """A paper with both a UNC author and a company author is kept, and the UNC
    author (not the non-UNC first author) is the named contact."""
    client = PubMedClient()
    papers = [{"pmid": "1", "title": "t", "authors": ["Smith J", "Doe A"]}]
    affils = {
        "1": [
            ("Smith J", "Johns Hopkins University, Baltimore, MD"),
            ("Doe A", "University of North Carolina at Chapel Hill"),
            ("Lee K", "NVIDIA Corporation, Santa Clara, CA"),
        ]
    }
    with patch.object(client, "_efetch_author_affils", return_value=affils):
        out = client._verify_coauthorship(papers, company_affiliation_regex("NVIDIA"))
    assert out[0]["verified_coauthorship"] is True
    assert out[0]["unc_authors"] == ["Doe A"]            # not Smith J (Hopkins)


def test_verify_coauthorship_drops_false_positive():
    """A paper whose only 'company' affiliation is meta-research (no real Meta
    Platforms author) is dropped even though a UNC author is present."""
    client = PubMedClient()
    papers = [{"pmid": "2", "title": "SPIRIT", "authors": ["Schulz KF"]}]
    affils = {
        "2": [
            ("Schulz KF", "University of North Carolina"),
            ("Ioannidis JPA", "Meta-Research Innovation Center, Stanford"),
        ]
    }
    with patch.object(client, "_efetch_author_affils", return_value=affils):
        out = client._verify_coauthorship(papers, company_affiliation_regex("Meta"))
    assert out[0]["verified_coauthorship"] is False


def test_verify_coauthorship_trusts_search_when_efetch_fails():
    """If EFETCH fails, the paper is kept for the count (ESEARCH already required
    both affiliations) but flagged unverified and surfaces no UNC author."""
    client = PubMedClient()
    papers = [{"pmid": "3", "title": "t", "authors": ["A B"]}]
    with patch.object(client, "_efetch_author_affils", return_value=None):
        out = client._verify_coauthorship(papers, company_affiliation_regex("Pfizer"))
    assert out[0]["verified_coauthorship"] is True
    assert out[0]["unverified_authors"] is True
    assert out[0]["unc_authors"] == []


def test_verify_coauthorship_drops_paper_with_no_unc_author():
    """A paper whose EFETCH authors include a company author but NO UNC author is
    dropped — the old 'or not authors' escape hatch is gone."""
    client = PubMedClient()
    papers = [{"pmid": "4", "title": "consortium", "authors": ["X Y"]}]
    affils = {"4": [
        ("Smith J", "Johns Hopkins University"),
        ("Lee K", "NVIDIA Corporation"),
    ]}
    with patch.object(client, "_efetch_author_affils", return_value=affils):
        out = client._verify_coauthorship(papers, company_affiliation_regex("NVIDIA"))
    assert out[0]["verified_coauthorship"] is False


def test_api_key_passed_in_params():
    """
    Takes: A client constructed with an explicit api_key.
    Does: Runs a search and inspects the request params.
    Returns: The api_key is included in the esearch query params.
    """
    client = PubMedClient(api_key="SECRET")
    with patch("aria_pi.clients.pubmed_client.requests.get",
               side_effect=[_esearch([])]) as mock_get:
        client._run("term", 5)
    params = mock_get.call_args.kwargs["params"]
    assert params["api_key"] == "SECRET"
