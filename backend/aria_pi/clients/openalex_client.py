"""OpenAlex co-authorship client — no API key required.

Uses the ROR identifier for UNC Chapel Hill (https://ror.org/0130frc33) to
anchor UNC affiliation precisely, avoiding the PubMed name-string issue that
can match UNC-Charlotte, UNC-Pemberton, or any other UNC-system campus.

Strategy: find works where
  1. at least one author's institution is UNC Chapel Hill (by ROR)
  2. at least one author's raw affiliation string mentions the company

This is true academic co-authorship — the company appears as a co-author's
employer, not just a word in the abstract.

Endpoint:
  GET https://api.openalex.org/works
  filter=institutions.ror:https://ror.org/0130frc33,
        raw_affiliation_string.search:{company_name}

Docs:
  https://docs.openalex.org/api-entities/works/filter-works
"""
import logging

import requests
from typing import List

logger = logging.getLogger(__name__)

UNC_ROR = "https://ror.org/0130frc33"
ENDPOINT = "https://api.openalex.org/works"
USER_AGENT = "InnovateCarolina research.intelligence@unc.edu"
TIMEOUT = 8

_SELECT = ",".join([
    "id", "title", "publication_year", "primary_location",
    "authorships", "open_access",
])


def _build_url(work: dict) -> str:
    """Prefer the open-access landing page URL; fall back to the OpenAlex ID URL."""
    oa = work.get("open_access") or {}
    landing = oa.get("oa_url") or ""
    if landing and landing.startswith("http"):
        return landing
    oa_id = work.get("id") or ""
    return oa_id  # OpenAlex IDs are already https://openalex.org/W… URLs


def search_unc_coauthorship(company_name: str, max_results: int = 8) -> List[dict]:
    """Works co-authored by a UNC author (ROR-anchored) and a company author.

    Returns a list of paper dicts with the same shape as PubMed results so
    they can be merged into the clinical.papers list without frontend changes:
      { pmid, title, year, journal, url, authors, source }

    Never raises — returns [] on any error.
    """
    if not company_name:
        return []

    filter_val = (
        f"institutions.ror:{UNC_ROR},"
        f"raw_affiliation_strings.search:{company_name}"
    )
    params = {
        "filter": filter_val,
        "sort": "publication_year:desc",
        "per-page": max_results,
        "select": _SELECT,
    }
    headers = {"User-Agent": USER_AGENT}

    try:
        r = requests.get(ENDPOINT, params=params, headers=headers, timeout=TIMEOUT)
        r.raise_for_status()
        results = (r.json() or {}).get("results", []) or []
    except Exception as e:
        logger.error("openalex: search failed for %s: %s", company_name, e)
        return []

    papers: List[dict] = []
    for w in results:
        title = (w.get("title") or "").strip()
        if not title:
            continue
        year = str(w.get("publication_year") or "")
        loc = w.get("primary_location") or {}
        source_obj = loc.get("source") or {}
        journal = (source_obj.get("display_name") or "").strip()
        url = _build_url(w)
        authors: List[str] = []
        for a in (w.get("authorships") or [])[:6]:
            name = ((a.get("author") or {}).get("display_name") or "").strip()
            if name:
                authors.append(name)
        papers.append({
            "pmid": "",
            "title": title,
            "year": year,
            "journal": journal,
            "url": url,
            "authors": authors,
            "source": "OpenAlex",
        })

    if papers:
        logger.info("openalex: %d co-authorship papers for %s", len(papers), company_name)
    else:
        logger.warning("openalex: 0 results for %s", company_name)
    return papers
