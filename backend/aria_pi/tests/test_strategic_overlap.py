"""Tests for the Strategic Overlap detector.

Covers Item 1A isolation and the two match paths, with a true positive (a real
shared phrase/terms produce a validated overlap) and a true negative (a weak or
absent match produces nothing — the signal is never fabricated).
"""
from aria_pi.clients.strategic_overlap import (
    StrategicOverlap,
    extract_item_1a,
    find_strategic_overlap,
)


# A compact 10-K-shaped narrative: a TOC pointer, then the real Item 1A body,
# ending at Item 1B. The risk body names concrete domain vocabulary.
TENK_TEXT = """
Table of Contents
Item 1A. Risk Factors 14
Item 1B. Unresolved Staff Comments 30

Item 1. Business
We design integrated circuits for data centers.

Item 1A. Risk Factors
Our results depend on advances in semiconductor lithography; any disruption to
extreme ultraviolet lithography equipment could delay our process roadmap and
harm our competitive position. We also rely on glioblastoma immunotherapy
research programs that may not reach commercialization.

Item 1B. Unresolved Staff Comments
None.

Item 2. Properties
We lease office space.
"""


def test_extract_item_1a_prefers_body_over_toc():
    """
    Takes: A 10-K with a table-of-contents pointer and a real Item 1A body.
    Does: Isolates the risk-factors section.
    Returns: The body text, bounded by Item 1B, not the TOC line.
    """
    body = extract_item_1a(TENK_TEXT)
    assert "semiconductor lithography" in body
    assert "Unresolved Staff Comments" not in body
    assert "We lease office space" not in body


def test_extract_item_1a_empty_on_missing_section():
    """
    Takes: Text with no Item 1A header.
    Does: Attempts isolation.
    Returns: An empty string.
    """
    assert extract_item_1a("Item 1. Business\nWe sell things.") == ""


def test_find_strategic_overlap_true_positive_phrase():
    """
    Takes: A 10-K whose risk text shares the phrase "semiconductor lithography"
           with a UNC grant title.
    Does: Scores the titles for a real overlap.
    Returns: A validated overlap on the strong phrase path.
    """
    titles = [
        {"title": "Advances in semiconductor lithography for sub-3nm nodes",
         "source_type": "grant"},
        {"title": "A study of rural primary care access", "source_type": "paper"},
    ]
    overlap = find_strategic_overlap(TENK_TEXT, titles, "https://sec.gov/filing")
    assert overlap is not None
    assert overlap["matched_phrase"] == "semiconductor lithography"
    assert overlap["source_type"] == "grant"
    assert overlap["filing_url"] == "https://sec.gov/filing"
    assert "lithography" in overlap["risk_excerpt"].lower()
    # The payload validates against the model.
    assert StrategicOverlap(**overlap).matched_title.startswith("Advances")


def test_find_strategic_overlap_true_positive_terms():
    """
    Takes: A title sharing two specific terms (glioblastoma, immunotherapy) but
           no two word phrase with the risk text.
    Does: Scores the titles.
    Returns: A validated overlap on the term path (no phrase).
    """
    titles = [
        {"title": "Immunotherapy approaches to pediatric glioblastoma",
         "source_type": "trial"},
    ]
    overlap = find_strategic_overlap(TENK_TEXT, titles, "")
    assert overlap is not None
    assert overlap["matched_phrase"] is None
    assert set(overlap["matched_terms"]) >= {"glioblastoma", "immunotherapy"}
    assert overlap["source_type"] == "trial"


def test_find_strategic_overlap_true_negative_weak_match():
    """
    Takes: Titles that share only generic business stopwords (results, business,
           market) or a single specific term with the risk text.
    Does: Scores the titles.
    Returns: None — a weak or boilerplate-only match is never surfaced.
    """
    titles = [
        {"title": "Business results and market conditions in the company",
         "source_type": "paper"},
        {"title": "A single mention of lithography only", "source_type": "paper"},
    ]
    assert find_strategic_overlap(TENK_TEXT, titles, "") is None


def test_find_strategic_overlap_no_section_returns_none():
    """
    Takes: Text with no Item 1A and otherwise-matching titles.
    Does: Attempts to score.
    Returns: None, because there is no risk section to match against.
    """
    titles = [{"title": "semiconductor lithography roadmap", "source_type": "grant"}]
    assert find_strategic_overlap("Item 1. Business only.", titles, "") is None


def test_model_rejects_blank_and_unknown_source():
    """
    Takes: Invalid overlap payloads.
    Does: Constructs the model.
    Returns: A validation error for blank fields and unknown source types.
    """
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        StrategicOverlap(matched_title="", source_type="grant", risk_excerpt="x")
    with pytest.raises(ValidationError):
        StrategicOverlap(matched_title="t", source_type="blog", risk_excerpt="x")
