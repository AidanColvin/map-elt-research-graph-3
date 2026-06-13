"""Tests for the SEC company-name entity resolver (typo-trap fix).

These hit the live SEC company_tickers.json (cached in-process), so they
validate the real fuzzy mapping rather than a mock.
"""

from aria_pi.utils.name_resolver import normalize_company_name


def test_typo_eli_lily_resolves_to_lilly():
    # The documented typo trap: "Eli Lily" must map to the official SEC title.
    resolved = normalize_company_name("Eli Lily")
    assert "lilly" in resolved.lower()
    assert resolved != "Eli Lily"


def test_apple_resolves_to_apple_inc():
    resolved = normalize_company_name("Apple").lower()
    assert "apple" in resolved and "inc" in resolved


def test_liquidia_resolves_to_official_title():
    # UNC spinout used in the UI test; must resolve to the canonical SEC title.
    assert "liquidia" in normalize_company_name("Liquidia").lower()


def test_unmatched_query_is_returned_unchanged():
    q = "zzqwer nonexistent placeholder xyz"
    assert normalize_company_name(q) == q


def test_guard_rejects_trailing_token_false_positive():
    # Must NOT resolve to an unrelated company that merely shares a trailing
    # token ("Technologies") — the first-token guard should reject it.
    resolved = normalize_company_name("Liquidia Technologies").lower()
    assert "westinghouse" not in resolved
    assert "air brake" not in resolved
