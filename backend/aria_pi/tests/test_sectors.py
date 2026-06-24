"""Tests for sector routing — the rules that decide whether a search term
maps to a curated company set or falls through to live SEC discovery.

These lock in the behavior added for niche, free-text searches: a qualified
multi-word term ("pet food", "solar panels") must NOT be force-fit into a
broad curated bucket; it should return None so the orchestrator researches it
live. Specific sectors and curated aliases must keep resolving.
"""
import pytest

from aria_pi.sectors import canonical_sector, _BROAD_TARGETS, SECTOR_SEEDS
from aria_pi.clients.sec_edgar_client import SECEdgarClient


# (input, expected canonical) — None means "route to live discovery".
ROUTING_CASES = [
    # Niche / qualified terms -> live discovery (None).
    ("Pet Food", None),
    ("Dog Food", None),
    ("Solar Panels", None),
    ("HVAC", None),
    ("Coffee", None),
    ("Video Games", "gaming"),
    ("Craft Beer", None),
    ("Electric Vehicle", None),
    ("Consumer Electronics", "consumer electronics"),
    # Curated aliases (whole-string) -> mapped.
    ("AI", "artificial intelligence"),
    ("Healthcare", "healthcare"),
    ("Financial Services", "finance"),
    ("EHR", "health it"),
    ("big tech", "technology"),
    # Specific sectors -> mapped (substring/keyword routes preserved).
    ("Pharmaceutical", "pharmaceutical"),
    ("car insurance", "insurance"),
    ("machine learning", "artificial intelligence"),
    ("gene therapy", "biotech"),
    ("oncology", "oncology"),
    ("managed care", "healthcare"),
    # Bare single broad words still map.
    ("food", "consumer"),
    ("tech", "technology"),
    # Multi-word exact sector keys.
    ("rural health", "rural health"),
    ("quantum computing", "quantum computing"),
    # Digital health / "health tech" — used to fall through to junk discovery
    # (OTC shells). Must resolve to the curated digital-health set.
    ("Health Tech", "digital health"),
    ("health tech", "digital health"),
    ("healthtech", "digital health"),
    ("Health Technology", "digital health"),
    ("digital health", "digital health"),
    ("ehealth", "digital health"),
    ("connected health", "digital health"),
    # Other "-tech" compounds → correct curated sector, never the generic
    # technology bucket or live discovery.
    ("med tech", "medtech"),
    ("cleantech", "climate tech"),
    ("green tech", "climate tech"),
    ("agtech", "ag-bio"),
]


@pytest.mark.parametrize("term,expected", ROUTING_CASES)
def test_canonical_sector_routing(term, expected):
    assert canonical_sector(term) == expected


def test_blank_input_returns_none():
    assert canonical_sector("") is None
    assert canonical_sector("   ") is None
    assert canonical_sector(None) is None


def test_broad_target_multiword_falls_through():
    """Every broad bucket word, when qualified, routes to discovery."""
    for target in _BROAD_TARGETS:
        qualified = f"specialty {target}"
        assert canonical_sector(qualified) is None, target


def test_curated_targets_exist_in_seeds():
    """Anything canonical_sector can return must have a seed list."""
    for _, expected in ROUTING_CASES:
        if expected is not None:
            assert expected in SECTOR_SEEDS, expected


# --- discovery query chain (pure, no network) ------------------------------

def test_discovery_queries_multiword_relaxes():
    qs = SECEdgarClient._discovery_queries("craft beer")
    assert qs[0] == '"craft beer"'      # exact phrase first
    assert "craft beer" in qs           # all-words fallback
    assert "beer" in qs                 # head-noun fallback
    # no duplicates, order preserved
    assert len(qs) == len(set(qs))


def test_discovery_queries_single_word():
    assert SECEdgarClient._discovery_queries("hvac") == ["hvac"]


def test_discovery_queries_dedupes():
    qs = SECEdgarClient._discovery_queries("solar solar")
    assert len(qs) == len(set(qs))


def test_discovery_queries_skip_generic_relaxation():
    """A multi-word term must not relax to a ubiquitous filler token
    ("tech"/"health"), which would sweep thousands of unrelated filers."""
    qs = SECEdgarClient._discovery_queries("fintech health")
    assert "health" not in qs          # generic — never a standalone query
    assert "fintech" in qs             # specific token is kept
    # Niche head nouns are still preserved (regression guard).
    assert "beer" in SECEdgarClient._discovery_queries("craft beer")


def test_spac_and_shell_names_dropped():
    from aria_pi.clients.sec_edgar_client import _SPAC_RE
    assert _SPAC_RE.search("Keen Vision Acquisition Corp.")
    assert _SPAC_RE.search("Athena Technology Acquisition Corp. II")
    assert _SPAC_RE.search("Generic Blank Check Co")
    # Real operating companies are kept.
    assert not _SPAC_RE.search("Apple Inc.")
    assert not _SPAC_RE.search("DexCom, Inc.")
    assert not _SPAC_RE.search("Teladoc Health, Inc.")


def test_digital_health_seeds_are_real_names():
    seeds = SECTOR_SEEDS["digital health"]
    assert "Apple" in seeds
    assert "Teladoc Health" in seeds
    assert len(seeds) == 15
