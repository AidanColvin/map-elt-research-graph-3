"""Tests for the partnership resolver's UNC-contact tallying."""
from aria_pi.clients.partnership_resolver import (
    _unc_top_authors, _person_key, _title_fingerprint, _doi_key,
)


def test_title_fingerprint_collapses_punctuation_and_errata():
    a = _title_fingerprint("Machine-Learning Imputation of Proteomic Data.")
    b = _title_fingerprint("Machine learning imputation of proteomic data")
    c = _title_fingerprint("Erratum: Machine learning imputation of proteomic data")
    assert a == b == c


def test_doi_key_normalizes_url_forms():
    assert _doi_key("https://doi.org/10.1/AbC") == _doi_key("10.1/abc")


def test_person_key_collapses_pubmed_and_openalex_forms():
    assert _person_key("Rowe SP") == _person_key("Steven P. Rowe")
    assert _person_key("Gibson K") == _person_key("Keisha L. Gibson")
    assert _person_key("Rowe SP") != _person_key("Gibson K")


def test_unc_top_authors_dedupes_and_prefers_full_name():
    papers = [
        {"unc_authors": ["Rowe SP", "Henry Fuchs"]},
        {"unc_authors": ["Steven P. Rowe"]},          # same person, richer spelling
        {"unc_authors": ["Gibson K"]},
    ]
    top = _unc_top_authors(papers)
    # Rowe appears in two papers → ranked first, shown as the spelled-out name.
    assert top[0] == "Steven P. Rowe"
    assert "Henry Fuchs" in top and "Gibson K" in top
    assert "Rowe SP" not in top                        # collapsed into the full name
    assert len(top) == 3                               # no duplicate Rowe


def test_unc_top_authors_ignore_org_names():
    papers = [{"unc_authors": ["NEXT Collaboration", "Jane D Smith"]}]
    top = _unc_top_authors(papers)
    assert top == ["Jane D Smith"]


def test_unc_top_authors_downweights_consortium_papers():
    """A UNC author on two small genuine collaborations outranks one who only
    appears on a single 80-author consortium 'vision statement'."""
    papers = [
        {"unc_authors": ["Jane A Smith"], "total_authors": 4},
        {"unc_authors": ["Jane A Smith"], "total_authors": 5},
        {"unc_authors": ["Robert B Jones"], "total_authors": 80},
    ]
    top = _unc_top_authors(papers)
    assert top[0] == "Jane A Smith"
    # 1/log2(80) ≈ 0.16 credit, so the consortium-only author ranks last
    assert top.index("Robert B Jones") == 1


def test_person_key_folds_diacritics_and_comma_form():
    # Same person across PubMed initials, accented full name, and "Last, First".
    assert _person_key("Tufekci Z") == _person_key("Zeynep Tüfekçi")
    assert _person_key("Chen, Tianlong") == _person_key("Tianlong Chen")


def test_unc_top_authors_dedupes_accented_and_comma_variants():
    papers = [
        {"unc_authors": ["Tufekci Z"]},
        {"unc_authors": ["Zeynep Tüfekçi"]},
        {"unc_authors": ["Chen, Tianlong"]},
    ]
    top = _unc_top_authors(papers)
    assert "Zeynep Tüfekçi" in top                  # richer accented form kept
    assert "Tianlong Chen" in top                   # comma form normalized for display
    assert "Chen, Tianlong" not in top
    assert len(top) == 2                            # Tüfekçi collapsed to one
