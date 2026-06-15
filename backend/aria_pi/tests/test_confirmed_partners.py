"""Unit tests for the confirmed-partners lookup client.

Follows the same mock-the-filesystem pattern used in test_name_resolver.py.
No network calls. The JSON is patched in-process.
"""

import pytest
from unittest.mock import patch, mock_open
import json

# A minimal two-record registry covering the alias cases we care about.
MOCK_DB = {
    "air force research laboratory": {
        "partner": "Air Force Research Laboratory (AFRL) / National Security Innovation Network (NSIN)",
        "partner_type": "Government",
        "unc_unit": "UNC Department of Chemistry",
        "engagement_type": "Sponsored research / prize challenge",
        "relationship_status": "Confirmed relationship",
        "best_evidence": "Strong Evidence of Relationship",
        "best_source_validity": "Valid Webpage",
        "best_source_url": "https://example.gov/grant",
        "best_snippet": "UNC Chapel Hill won Phase 1 of the AFRL Grand Challenge.",
        "notes": "Partner, UNC, and relationship language appear near each other.",
    },
    "afrl": {
        "partner": "Air Force Research Laboratory (AFRL) / National Security Innovation Network (NSIN)",
        "partner_type": "Government",
        "unc_unit": "UNC Department of Chemistry",
        "engagement_type": "Sponsored research / prize challenge",
        "relationship_status": "Confirmed relationship",
        "best_evidence": "Strong Evidence of Relationship",
        "best_source_validity": "Valid Webpage",
        "best_source_url": "https://example.gov/grant",
        "best_snippet": "UNC Chapel Hill won Phase 1 of the AFRL Grand Challenge.",
        "notes": "",
    },
    "leidos": {
        "partner": "Leidos",
        "partner_type": "Corporate",
        "unc_unit": "UNC School of Medicine",
        "engagement_type": "Research partnership",
        "relationship_status": "Confirmed relationship",
        "best_evidence": "Possible Evidence of Relationship",
        "best_source_validity": "Valid Webpage",
        "best_source_url": "https://leidos.com/unc",
        "best_snippet": "Leidos and UNC Chapel Hill announced a joint research initiative.",
        "notes": "",
    },
}

MOCK_JSON = json.dumps(MOCK_DB)


@pytest.fixture(autouse=True)
def reset_cache():
    """Clear the module-level cache before every test so patches take effect."""
    import aria_pi.clients.confirmed_partners_client as mod
    mod._CACHE = None
    yield
    mod._CACHE = None


def _patched_open():
    return patch("builtins.open", mock_open(read_data=MOCK_JSON))


class TestResolveConfirmedPartner:

    def test_exact_name_match(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner
        with _patched_open():
            result = resolve_confirmed_partner("Air Force Research Laboratory")
        assert result["found"] is True
        assert result["partner_type"] == "Government"
        assert result["unc_unit"] == "UNC Department of Chemistry"

    def test_case_insensitive(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner
        with _patched_open():
            result = resolve_confirmed_partner("AIR FORCE RESEARCH LABORATORY")
        assert result["found"] is True

    def test_acronym_alias_match(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner
        with _patched_open():
            result = resolve_confirmed_partner("AFRL")
        assert result["found"] is True
        assert result["engagement_type"] == "Sponsored research / prize challenge"

    def test_first_word_fallback_match(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner
        with _patched_open():
            result = resolve_confirmed_partner("Leidos Holdings, Inc.")
        assert result["found"] is True
        assert result["partner_type"] == "Corporate"

    def test_no_match_returns_empty(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner, EMPTY_CONFIRMED
        with _patched_open():
            result = resolve_confirmed_partner("Some Random Company")
        assert result["found"] is False
        assert result == EMPTY_CONFIRMED

    def test_empty_string_returns_empty(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner, EMPTY_CONFIRMED
        with _patched_open():
            result = resolve_confirmed_partner("")
        assert result == EMPTY_CONFIRMED

    def test_missing_file_returns_empty_gracefully(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner, EMPTY_CONFIRMED
        import aria_pi.clients.confirmed_partners_client as mod
        mod._CACHE = None
        with patch("builtins.open", side_effect=FileNotFoundError):
            result = resolve_confirmed_partner("Leidos")
        assert result == EMPTY_CONFIRMED

    def test_source_url_is_preserved(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner
        with _patched_open():
            result = resolve_confirmed_partner("Leidos")
        assert result["best_source_url"] == "https://leidos.com/unc"

    def test_snippet_is_preserved(self):
        from aria_pi.clients.confirmed_partners_client import resolve_confirmed_partner
        with _patched_open():
            result = resolve_confirmed_partner("Air Force Research Laboratory")
        assert "UNC Chapel Hill" in result["best_snippet"]
