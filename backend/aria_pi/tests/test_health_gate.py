"""Tests for the non-health sector trial-collision gate.

A ClinicalTrials.gov sponsor match on a non-health company (a bank running an
"oncology trial") is a name collision. The gate must drop those trial signals
at the source for non-health sectors while leaving health sectors untouched.
"""

from aria_pi.sectors import is_health_sector
from aria_pi.orchestrator import _strip_trial_signals


def test_health_sectors_detected():
    """
    takes: nothing
    does: checks that clear health-sector names classify as health
    gives: no assertion error when every name is detected as health
    """
    for name in ["oncology", "biotech", "pharmaceutical", "medtech",
                 "genomics", "gene therapy", "pediatric oncology",
                 "hospital systems", "medical devices"]:
        assert is_health_sector(name), name


def test_non_health_sectors_detected():
    """
    takes: nothing
    does: checks that business/tech sector names classify as non-health
    gives: no assertion error when every name is detected as non-health
    """
    for name in ["fintech", "technology", "cybersecurity", "aerospace",
                 "renewable energy", "retail", "insurance",
                 "neuromorphic computing", "semiconductors"]:
        assert not is_health_sector(name), name


def test_strip_clears_trials_keeps_other_signals():
    """
    takes: nothing
    does: strips trial signals from a company and confirms trials/unc_trials are
          emptied while PubMed and NIH signals survive
    gives: no assertion error when only trial fields are cleared
    """
    company = {"trials": [{"nct_id": "NCT1"}], "unc_trials": [{"nct_id": "NCT1"}],
               "pubmed": [{"pmid": "1"}], "nih_grants": [{"pi": "X"}]}
    _strip_trial_signals([company])
    assert company["trials"] == []
    assert company["unc_trials"] == []
    assert company["pubmed"] == [{"pmid": "1"}]
    assert company["nih_grants"] == [{"pi": "X"}]
