"""Tests for the shared affiliation matcher (UNC + company disambiguation)."""
from aria_pi.utils.affiliation import (
    is_unc_affiliation, company_aliases, company_query_clause,
    company_affiliation_regex,
)


def test_is_unc_affiliation_accepts_chapel_hill_and_centers():
    assert is_unc_affiliation("Department of Medicine, University of North Carolina at Chapel Hill")
    assert is_unc_affiliation("UNC Lineberger Comprehensive Cancer Center")
    assert is_unc_affiliation("Gillings School of Global Public Health, Chapel Hill, NC")


def test_is_unc_affiliation_rejects_sibling_campuses_and_nc_state():
    assert not is_unc_affiliation("University of North Carolina at Charlotte")
    assert not is_unc_affiliation("University of North Carolina Greensboro")
    assert not is_unc_affiliation("North Carolina State University, Raleigh")
    assert not is_unc_affiliation("Johns Hopkins University, Baltimore, MD")
    assert not is_unc_affiliation("")


def test_company_aliases_maps_ambiguous_names():
    assert company_aliases("Meta") == ["Meta Platforms", "Facebook"]
    assert company_aliases("Amazon Web Services (AWS)") == ["Amazon Web Services", "Amazon.com"]
    # Unmapped distinctive names fall back to the de-parenthesized name.
    assert company_aliases("Moderna") == ["Moderna"]
    assert company_aliases("Red Hat (IBM)") == ["Red Hat"]


def test_company_query_clause_uses_real_corporate_names():
    clause = company_query_clause("Meta")
    assert '"Meta Platforms"[Affiliation]' in clause
    assert '"Facebook"[Affiliation]' in clause
    assert '"Meta"[Affiliation]' not in clause  # the ambiguous bare token is gone


def test_company_regex_excludes_meta_research_but_keeps_meta_platforms():
    rx = company_affiliation_regex("Meta")
    assert rx.search("Reality Labs, Meta Platforms, Menlo Park, CA")
    assert rx.search("Facebook AI Research")
    assert rx.search("Meta, Menlo Park, CA")          # bare token, corporate
    assert not rx.search("Meta-Research Innovation Center, Stanford")
    assert not rx.search("Department of Metabolic and Functional Rehabilitation")
    assert not rx.search("meta-analysis working group")


def test_company_regex_matches_distinctive_names():
    assert company_affiliation_regex("NVIDIA").search("NVIDIA Corporation, Santa Clara")
    assert company_affiliation_regex("Salesforce").search("Salesforce Research")
