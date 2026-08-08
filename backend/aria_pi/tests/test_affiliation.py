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
    assert company_aliases("Meta")[:2] == ["Meta Platforms", "Facebook"]
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


def test_common_word_companies_never_match_bare_prose():
    # "Visa" must mean the payments company, not immigration paperwork.
    rx = company_affiliation_regex("Visa")
    assert not rx.search("supported by a J-1 visa program, Chapel Hill, NC")
    assert not rx.search("Visakhapatnam Institute of Medical Sciences")
    assert rx.search("Visa Research, Visa Inc, Foster City, CA")
    # "Block" is a surname and a building — only the corporate entity counts.
    rx = company_affiliation_regex("Block")
    assert not rx.search("Block Center for Integrative Cancer Research")
    assert not rx.search("Gene Block Laboratory, UCLA")
    assert rx.search("Block, Inc, San Francisco, CA")
    # "Affirm" is a verb in half of all abstracts.
    rx = company_affiliation_regex("Affirm Holdings")
    assert not rx.search("these results affirm the hypothesis")
    assert rx.search("Affirm Holdings, San Francisco")
    # "Amazon" alone is a rainforest; the company writes Amazon.com / AWS.
    rx = company_affiliation_regex("Amazon")
    assert not rx.search("Amazon Basin Ecology Program, Manaus")
    assert rx.search("Amazon.com, Inc, Seattle, WA")
    # "Green Dot" appears literally in vision studies.
    rx = company_affiliation_regex("Green Dot Corporation")
    assert not rx.search("a green dot stimulus was displayed")
    assert rx.search("Green Dot Corporation, Austin, TX")
    # "Tesla" is the magnetic-field unit in every MRI grant.
    rx = company_affiliation_regex("Tesla")
    assert not rx.search("images acquired on a 3 Tesla scanner")
    assert rx.search("Tesla, Inc, Palo Alto, CA")
    # "Stem" is stem cells, not the storage company.
    rx = company_affiliation_regex("Stem")
    assert not rx.search("Center for Stem Cell Biology")
    assert rx.search("Stem, Inc, San Francisco")
    # "Micron" is a unit of length; "Arm" is a robotic arm or a trial arm.
    assert not company_affiliation_regex("Micron").search("particles under 5 micron diameter")
    assert company_affiliation_regex("Micron").search("Micron Technology, Boise, ID")
    assert not company_affiliation_regex("Arm Holdings").search("the placebo arm of the trial")
    assert company_affiliation_regex("Arm Holdings").search("Arm Holdings plc, Cambridge, UK")
    # Common-bigram names: the phrase must be the corporation, not prose.
    rx = company_affiliation_regex("Pattern Energy")
    assert not rx.search("activity pattern energy expenditure in older adults")
    assert rx.search("Pattern Energy Group, San Francisco")
    rx = company_affiliation_regex("First Solar")
    assert not rx.search("the first solar-powered irrigation study")
    assert rx.search("First Solar, Inc, Tempe, AZ")


def test_common_word_companies_query_only_corporate_phrases():
    for name, banned in [("Visa", '"Visa"[Affiliation]'),
                         ("Block", '"Block"[Affiliation]'),
                         ("Target", '"Target"[Affiliation]'),
                         ("Affirm Holdings", '"Affirm Holdings"[Affiliation]')]:
        clause = company_query_clause(name)
        if name == "Affirm Holdings":
            # The full corporate name IS the safe phrase here.
            assert banned in clause
        else:
            assert banned not in clause, f"{name}: bare token leaked into {clause}"


def test_insurance_common_words_never_match_bare_prose():
    # "Progressive" is a stock adjective in medical abstracts.
    rx = company_affiliation_regex("Progressive")
    assert not rx.search("a diagnosis of progressive multiple sclerosis")
    assert not rx.search("progressive hearing loss in older adults")
    assert rx.search("Progressive Corporation, Mayfield Village, OH")
    # "Travelers" names any traveler-health study, not the insurer.
    rx = company_affiliation_regex("Travelers")
    assert not rx.search("malaria prophylaxis in returning travelers")
    assert not rx.search("a cohort of international travelers")
    assert rx.search("Travelers Companies, New York, NY")


def test_insurance_common_words_query_only_corporate_phrases():
    assert '"Progressive"[Affiliation]' not in company_query_clause("Progressive")
    assert '"Travelers"[Affiliation]' not in company_query_clause("Travelers")


def test_mosaic_never_matches_genetic_mosaicism():
    rx = company_affiliation_regex("Mosaic")
    assert not rx.search("a case of chromosomal mosaicism in a developmental cohort")
    assert not rx.search("genetic mosaic analysis of neuronal lineages")
    assert rx.search("Mosaic Company, Tampa, FL")
    assert '"Mosaic"[Affiliation]' not in company_query_clause("Mosaic")


def test_rtx_and_moog_never_match_unrelated_science():
    # RTX = Resiniferatoxin, a standard pain-research reagent abbreviation.
    rx = company_affiliation_regex("RTX")
    assert not rx.search("rats were injected with RTX (resiniferatoxin) intrathecally")
    assert rx.search("RTX Corporation, Arlington, VA")
    # Moog is also a common surname.
    rx = company_affiliation_regex("Moog")
    assert not rx.search("Moog CM, Department of Otolaryngology, University of Iowa")
    assert rx.search("Moog Inc, East Aurora, NY")


def test_aflac_never_matches_the_cancer_center():
    """
    takes: nothing
    does: confirms the Aflac insurer regex rejects the pediatric cancer center
          named after the company and accepts only the corporate affiliation
    gives: no assertion error when the collision is blocked
    """
    rx = company_affiliation_regex("Aflac")
    assert not rx.search("aflac cancer and blood disorders center, atlanta")
    assert rx.search("Aflac Incorporated, Columbus, GA")
    assert '"Aflac"[Affiliation]' not in company_query_clause("Aflac")
