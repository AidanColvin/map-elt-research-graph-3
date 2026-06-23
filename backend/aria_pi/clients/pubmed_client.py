"""PubMed Entrez client — free, no API key required.

Uses direct HTTP against E-utilities (no Biopython dependency) so it works
reliably on Vercel Python serverless. Searches both AFFILIATION and TEXT
to catch UNC↔industry co-authored publications, which are the primary
public signal of an existing research relationship.
"""
import logging
import requests
import time
import threading
from typing import List
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

from aria_pi.utils.affiliation import (
    is_unc_affiliation, company_affiliation_regex, company_query_clause,
)

# NCBI E-utilities cap keyless clients at ~3 requests/sec/IP. A process-wide
# throttle (lock + min interval) keeps every PubMed request — even across the
# concurrent threads the resolvers use — under that limit, so bursts no longer
# get 429'd and silently return empty.
_NCBI_LOCK = threading.Lock()
_NCBI_MIN_INTERVAL = 0.35
_ncbi_last = [0.0]


def _ncbi_throttle() -> None:
    """takes: nothing; does: blocks until >= _NCBI_MIN_INTERVAL has elapsed since
    the previous NCBI request (process-wide); returns: nothing."""
    with _NCBI_LOCK:
        wait = _NCBI_MIN_INTERVAL - (time.monotonic() - _ncbi_last[0])
        if wait > 0:
            time.sleep(wait)
        _ncbi_last[0] = time.monotonic()

ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
EMAIL = "research.intelligence@unc.edu"
TOOL = "aria-pi"


class PubMedClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key
        self.timeout = 8

    def search_unc_with_company(self, company_name: str, max_results: int = 5) -> List[dict]:
        """Find papers genuinely CO-AUTHORED by a UNC author and a company author.

        Query strategy: require BOTH the company and UNC to appear as author
        AFFILIATIONS — i.e. an employee of the company and a UNC researcher are
        co-authors on the same paper. This is true co-authorship.

        The company is intentionally NOT matched in the title/abstract: that
        looser match counted papers that merely *mention* a company (e.g. a UNC
        paper that "used NVIDIA GPUs" or "studied Pfizer's drug"), which
        overstated partnership ties — especially for non-health firms whose
        products are referenced in methods sections. Affiliation-only keeps the
        signal to verifiable co-authorship.

        Two precision steps then make the result trustworthy per company:
          1. The company affiliation clause is built from its real corporate
             names (e.g. Meta → "Meta Platforms"/"Facebook"), so the bare token
             no longer matches "Meta-Research"/"metabolic".
          2. Each candidate paper is re-fetched (EFETCH) for per-author
             affiliations and KEPT ONLY IF a genuine UNC author and a genuine
             company author are both present — and the UNC author(s) are named
             in ``unc_authors`` so the contact list shows real UNC people, not a
             paper's unrelated first author.
        """
        company_clause = company_query_clause(company_name)
        term = (f'{company_clause}'
                f' AND ("University of North Carolina"[Affiliation]'
                f' OR "UNC Chapel Hill"[Affiliation])')
        papers = self._run(term, max_results)
        papers = self._verify_coauthorship(papers, company_affiliation_regex(company_name))
        return [p for p in papers if p.get("verified_coauthorship")]

    # Affiliation phrases for the UNC schools / centers we want to attribute
    # publications to specifically. Each is queried separately so we know
    # WHICH UNC unit holds the relationship.
    UNC_SCHOOLS = [
        ("Gillings School of Global Public Health",
         '"Gillings"[Affiliation]'),
        ("UNC School of Medicine",
         '("UNC School of Medicine"[Affiliation] '
         'OR "University of North Carolina School of Medicine"[Affiliation])'),
        ("UNC Lineberger Comprehensive Cancer Center",
         '"Lineberger"[Affiliation]'),
        ("UNC Eshelman School of Pharmacy",
         '"Eshelman"[Affiliation]'),
        ("Carolina Health Informatics Program",
         '("Carolina Health Informatics"[Affiliation] '
         'OR "Cecil G. Sheps Center"[Affiliation])'),
    ]

    def search_by_unc_schools(self, company_name: str,
                              max_per_school: int = 3) -> List[dict]:
        """Run one PubMed query per UNC school and tag each hit with the school.

        Gives Section 2.2 (UNC Faculty) real school attribution rather than
        the generic "UNC Chapel Hill (verify school via faculty page)" tag.
        """
        results: List[dict] = []
        for school_name, aff_clause in self.UNC_SCHOOLS:
            # Strict co-authorship: the company must be an author affiliation,
            # not merely mentioned in the title/abstract (consistent with
            # search_unc_with_company). The company clause uses real corporate
            # names so a bare token can't match an unrelated affiliation.
            term = (f'{company_query_clause(company_name)} AND {aff_clause}')
            hits = self._run(term, max_per_school)
            for h in hits:
                h["unc_school"] = school_name
                results.append(h)
        # Dedupe by pmid, preserving first school it appeared under
        seen, out = set(), []
        for h in results:
            if h.get("pmid") and h["pmid"] not in seen:
                seen.add(h["pmid"]); out.append(h)
        return out

    def search_coi_disclosures(self, company_name: str, max_results: int = 3) -> List[dict]:
        """Find UNC-authored papers that disclose a relationship with the company.

        Journals require COI disclosures (consulting fees, equity, research
        funding) in the body of the paper. Searching `<company> AND
        ("conflict of interest" OR "disclosure" OR "funding")` against a UNC
        affiliation surfaces these public disclosures.
        """
        term = (f'{company_query_clause(company_name, "Title/Abstract")}'
                f' AND ("conflict of interest"[Title/Abstract]'
                f'      OR "disclosure"[Title/Abstract]'
                f'      OR "funding"[Title/Abstract])'
                f' AND ("University of North Carolina"[Affiliation]'
                f'      OR "UNC Chapel Hill"[Affiliation])')
        return self._run(term, max_results)

    def search_by_affiliation(self, query: str, affiliation: str, max_results: int = 5) -> List[dict]:
        """Legacy entry point kept for compatibility."""
        term = f"({query}) AND ({affiliation}[Affiliation])"
        return self._run(term, max_results)

    def _run(self, term: str, max_results: int) -> List[dict]:
        params = {
            "db": "pubmed",
            "term": term,
            "retmax": str(max_results),
            "retmode": "json",
            "tool": TOOL,
            "email": EMAIL,
        }
        if self.api_key:
            params["api_key"] = self.api_key

        try:
            _ncbi_throttle()
            r = requests.get(ESEARCH, params=params, timeout=self.timeout)
            r.raise_for_status()
            ids = (r.json().get("esearchresult") or {}).get("idlist") or []
        except Exception as e:
            logger.warning("PubMed esearch error: %s", e)
            return []

        if not ids:
            return []

        # Pull summaries
        sp = {
            "db": "pubmed",
            "id": ",".join(ids),
            "retmode": "json",
            "tool": TOOL,
            "email": EMAIL,
        }
        if self.api_key:
            sp["api_key"] = self.api_key

        try:
            _ncbi_throttle()
            r = requests.get(ESUMMARY, params=sp, timeout=self.timeout)
            r.raise_for_status()
            result = r.json().get("result") or {}
        except Exception as e:
            logger.warning("PubMed esummary error: %s", e)
            return []

        papers = []
        for pmid in ids:
            item = result.get(pmid) or {}
            if not item:
                continue
            authors_raw = item.get("authors") or []
            authors = [a.get("name") for a in authors_raw if a.get("name")][:4]
            pubdate = item.get("pubdate") or ""
            papers.append({
                "pmid": pmid,
                "title": item.get("title") or "",
                "authors": authors,
                "journal": item.get("fulljournalname") or item.get("source") or "",
                "year": pubdate[:4] if pubdate else "",
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            })
        return papers

    def _efetch_author_affils(self, pmids: List[str]):
        """takes: a list of PMIDs; does: pulls each paper's per-author
        affiliations via EFETCH (XML) — the data ESUMMARY omits; returns: a
        dict ``pmid -> [(author_name, affiliation_text), ...]``, or None if the
        request fails (so callers can fall back to trusting the search filter)."""
        if not pmids:
            return {}
        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
            "tool": TOOL,
            "email": EMAIL,
        }
        if self.api_key:
            params["api_key"] = self.api_key
        try:
            _ncbi_throttle()
            r = requests.get(EFETCH, params=params, timeout=self.timeout)
            r.raise_for_status()
            root = ET.fromstring(r.content)
        except Exception as e:
            logger.warning("PubMed efetch error: %s", e)
            return None

        out = {}
        for art in root.findall(".//PubmedArticle"):
            pmid = art.findtext("./MedlineCitation/PMID") or ""
            if not pmid:
                continue
            authors = []
            for a in art.findall(".//Author"):
                last = a.findtext("LastName") or ""
                fore = a.findtext("ForeName") or ""
                ini = a.findtext("Initials") or ""
                # Prefer the spelled-out given name ("Steven Rowe") over initials
                # ("Rowe SP"): it dedupes cleanly against OpenAlex's full names
                # and is far less collision-prone than a bare surname+initial.
                if last and fore:
                    name = f"{fore} {last}".strip()
                elif last:
                    name = f"{last} {ini}".strip()
                else:
                    name = a.findtext("CollectiveName") or ""
                affs = " ; ".join(
                    (af.text or "") for af in a.findall(".//Affiliation") if af.text
                )
                if name:
                    authors.append((name, affs))
            out[pmid] = authors
        return out

    def _verify_coauthorship(self, papers: List[dict], company_re) -> List[dict]:
        """takes: papers from a UNC+company affiliation search and the compiled
        company-affiliation regex; does: re-fetches per-author affiliations and
        tags each paper with the named UNC author(s) and whether a genuine
        company author is also present; returns: the papers, each carrying
        ``unc_authors`` and ``verified_coauthorship``.

        On EFETCH failure the search filter is trusted (the ESEARCH already
        required both a company and a UNC affiliation), so papers are kept but
        ``unc_authors`` is left empty rather than guessed.
        """
        if not papers:
            return papers
        affils = self._efetch_author_affils([p["pmid"] for p in papers if p.get("pmid")])
        for p in papers:
            if affils is None:                       # EFETCH failed — trust ESEARCH
                # The ESEARCH already required both a company and a UNC
                # affiliation, so keep the paper for the COUNT, but mark it
                # unverified and surface NO contacts from it (we can't name the
                # real UNC author without affiliations — guessing risks role
                # inversion, e.g. tagging the company's own employee as UNC).
                p.setdefault("unc_authors", [])
                p["verified_coauthorship"] = True
                p["unverified_authors"] = True
                continue
            authors = affils.get(p.get("pmid", ""), [])
            p["total_authors"] = len(authors)
            unc = [n for n, aff in authors if is_unc_affiliation(aff)]
            has_company = any(company_re.search(aff) for n, aff in authors) if company_re else False
            p["unc_authors"] = list(dict.fromkeys(unc))[:5]
            # Keep the paper ONLY when a genuine UNC author AND a genuine company
            # author are both present. (The previous "or not authors" escape
            # hatch let consortium/keyword matches through whenever EFETCH
            # returned no parseable authors — a real false-positive source.)
            p["verified_coauthorship"] = bool(p["unc_authors"] and has_company)
        return papers
