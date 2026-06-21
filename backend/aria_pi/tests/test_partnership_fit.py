"""Tests for the deterministic Partnership Fit recommender."""
from aria_pi.clients.partnership_fit import build_fit, infer_domain_tags


def test_domain_tags_from_curated_map_and_sic():
    assert "ai" in infer_domain_tags("NVIDIA")
    assert "drug-discovery" in infer_domain_tags("Pfizer")
    # Unknown name falls back to SIC keywords.
    assert "drug-discovery" in infer_domain_tags("Genmab A/S", "Pharmaceutical Preparations")
    assert infer_domain_tags("Totally Unknown Co") == set()


def test_strategic_fit_beats_single_incidental_paper():
    """One incidental pharma paper must not bury NVIDIA's obvious CS fit."""
    fit = build_fit("NVIDIA", "",
                    [{"unit": "UNC Eshelman School of Pharmacy", "count": 1}],
                    [], [], [])
    names = [u["name"] for u in fit["best_units"]]
    assert names[0] == "UNC Department of Computer Science"
    assert fit["has_documented_tie"] is True


def test_multi_paper_tie_leads_and_is_marked_documented():
    fit = build_fit("Pfizer", "",
                    [{"unit": "UNC Lineberger Comprehensive Cancer Center", "count": 4},
                     {"unit": "UNC Gillings School of Global Public Health", "count": 3}],
                    [{"pi": "x"}], [], [])
    top = fit["best_units"][0]
    assert "Lineberger" in top["name"]
    assert top["documented"] is True and top["evidence_papers"] == 4
    assert "co-publishing" in top["current"]
    assert top["forms"]                                  # concrete partnership vehicles


def test_no_tie_data_company_suggests_data_science():
    fit = build_fit("Snowflake", "", [], [], [], [])
    assert fit["has_documented_tie"] is False
    assert "Data Science" in fit["best_units"][0]["name"]
    assert "could" not in fit["summary"].lower() or "potential" in fit["summary"].lower()
    assert all(not u["documented"] for u in fit["best_units"])


def test_offdomain_company_is_honest_about_limited_fit():
    """A company with no UNC research overlap gets an honest caveat, not a
    fabricated pairing."""
    fit = build_fit("Totally Unrelated Widgets Co", "Industrial Machinery", [], [], [], [])
    assert fit["caveat"]
    assert "limited" in fit["summary"].lower() or "exploratory" in fit["caveat"].lower()
