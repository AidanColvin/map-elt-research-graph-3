import pytest
from aria_pi.utils.source_tagger import SourceTagger

def test_validate_claim_success():
    """
    Takes: A valid claim and two non-blocked sources.
    Does: Validates that the claim meets the 2-source minimum.
    Returns: is_valid=True and the list of clean sources.
    """
    tagger = SourceTagger()
    sources = ["https://nih.gov/article1", "https://pubmed.ncbi.nlm.nih.gov/123"]
    is_valid, clean = tagger.validate_claim("Data pipelines accelerate research.", sources)
    assert is_valid is True
    assert len(clean) == 2

def test_validate_claim_failure_due_to_blocklist():
    """
    Takes: A claim with one valid source and one blocked source (Wikipedia).
    Does: Filters the blocked source and triggers a validation failure.
    Returns: is_valid=False and only the clean source.
    """
    tagger = SourceTagger()
    sources = ["https://nih.gov/article1", "https://en.m.wikipedia.org/wiki/Data"]
    is_valid, clean = tagger.validate_claim("Data pipelines accelerate research.", sources)
    assert is_valid is False
    assert len(clean) == 1

def test_duplicate_url_is_not_two_sources():
    """
    Takes: The same reputable URL listed twice.
    Does: Validates it.
    Returns: is_valid=False — a duplicate is one source, not two.
    """
    tagger = SourceTagger()
    is_valid, clean = tagger.validate_claim(
        "x", ["https://www.sec.gov", "https://www.sec.gov"])
    assert is_valid is False
    assert len(clean) == 1


def test_non_reputable_sources_rejected():
    """
    Takes: Two well-formed URLs that are neither .gov/.edu nor allowlisted orgs.
    Does: Validates them.
    Returns: is_valid=False — random domains are not reputable primary sources.
    """
    tagger = SourceTagger()
    is_valid, clean = tagger.validate_claim(
        "x", ["https://someblog.com/a", "https://medium.com/b"])
    assert is_valid is False
    assert clean == []


def test_malformed_sources_rejected():
    """
    Takes: A bare host with no scheme and a non-http scheme.
    Does: Validates them.
    Returns: is_valid=False — neither is a usable http(s) URL.
    """
    tagger = SourceTagger()
    is_valid, clean = tagger.validate_claim(
        "x", ["sec.gov", "javascript:alert(1)"])
    assert is_valid is False
    assert clean == []


def test_company_website_counts_when_supplied():
    """
    Takes: A government source plus the subject company's own website.
    Does: Validates with the company domain passed in.
    Returns: is_valid=True — the company site counts as a reputable source.
    """
    tagger = SourceTagger()
    is_valid, clean = tagger.validate_claim(
        "x", ["https://www.sec.gov/filing", "https://www.modernatx.com/about"],
        company_domains=("modernatx.com",))
    assert is_valid is True
    assert len(clean) == 2


def test_tag_or_flag_applies_unverified_flag():
    """
    Takes: A claim with insufficient sources.
    Does: Processes the claim through the tagging engine.
    Returns: A Claim object with the [UNVERIFIED] tag appended.
    """
    tagger = SourceTagger()
    claim = tagger.tag_or_flag("This is an unsourced claim.", ["https://nih.gov/1"], "Stage 4")
    assert claim.is_verified is False
    assert "[UNVERIFIED" in claim.text
    assert claim.unverified_reason is not None
