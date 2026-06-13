"""Partnership resolver — fans out to existing free clients to map verifiable
relationships between UNC Chapel Hill and a specific company or sector.

Every fact returned is tied to a verbatim source quote (a paper title + PMID,
an exact SEC sentence, or an official UNC web mention) so it can be clinically
validated by a human. There are NO AI-generated summaries here: this module
only locates and extracts real, citable text from public APIs.

Sources fanned out to:
  • PubMed (Entrez)  — UNC↔company co-authored publications (titles + PMIDs)
  • SEC EDGAR        — verbatim "University of North Carolina" sentences in
                       the company's recent 10-K / 8-K / DEF 14A filings
  • Web search       — site:unc.edu mentions of the company (press / labs)
"""
import re
from concurrent.futures import ThreadPoolExecutor
from typing import List

from aria_pi.clients.pubmed_client import PubMedClient
from aria_pi.clients.sec_edgar_client import (
    SECEdgarClient,
    _strip_proxy_html,
)
from aria_pi.clients.web_search_client import WebSearchClient

# Verbatim phrases that signal a UNC relationship inside an SEC filing. We only
# ever surface the EXACT sentence containing one of these — never a paraphrase.
_UNC_PHRASES = ("University of North Carolina", "UNC Chapel Hill", "UNC-Chapel Hill")

# Splits a block of filing text into individual sentences for verbatim extraction.
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _extract_unc_sentences(text: str, max_quotes: int = 4) -> List[str]:
    """takes: plain filing text and a max number of quotes,
    does: finds every sentence that verbatim contains a UNC phrase,
    returns: a deduped list of exact sentence strings (no paraphrasing)."""
    if not text:
        return []
    quotes: List[str] = []
    seen: set = set()
    for sentence in _SENTENCE_SPLIT.split(text):
        clean = re.sub(r"\s+", " ", sentence).strip()
        if not clean or len(clean) > 600:
            continue
        if any(phrase.lower() in clean.lower() for phrase in _UNC_PHRASES):
            key = clean.lower()
            if key not in seen:
                seen.add(key)
                quotes.append(clean)
        if len(quotes) >= max_quotes:
            break
    return quotes


class PartnershipResolver:
    def __init__(self):
        """takes: nothing,
        does: instantiates the underlying free PubMed/SEC/web-search clients,
        returns: nothing."""
        self.pubmed = PubMedClient()
        self.sec = SECEdgarClient()
        self.web = WebSearchClient()

    def resolve_company(self, company_name: str) -> dict:
        """takes: a single company name string,
        does: fans out to PubMed, SEC EDGAR, and web search concurrently to
              collect verbatim UNC↔company relationship evidence,
        returns: a dict with `research`, `financial`, and `ecosystem` sections
                 plus a total `mention_count` used for sector ranking."""
        with ThreadPoolExecutor(max_workers=3) as pool:
            f_research = pool.submit(self._resolve_research, company_name)
            f_financial = pool.submit(self._resolve_financial, company_name)
            f_ecosystem = pool.submit(self._resolve_ecosystem, company_name)
            research = _safe(f_research, "research", {"paper_count": 0, "top_authors": [], "papers": []})
            financial = _safe(f_financial, "financial", {"filings": []})
            ecosystem = _safe(f_ecosystem, "ecosystem", {"mentions": []})

        mention_count = (
            research.get("paper_count", 0)
            + sum(len(f.get("quotes", [])) for f in financial.get("filings", []))
            + len(ecosystem.get("mentions", []))
        )
        return {
            "company": company_name,
            "type": "company",
            "mention_count": mention_count,
            "research": research,
            "financial": financial,
            "ecosystem": ecosystem,
        }

    def resolve_sector(self, sector: str, top_n: int = 10) -> dict:
        """takes: a free-text sector string and an optional result cap,
        does: discovers real public companies in the sector via SEC EDGAR,
              resolves each one's UNC evidence, and ranks them by total
              mention count,
        returns: a dict holding ONLY the Top N companies (default 10) to keep
                 the frontend payload small and prevent rendering freezes."""
        try:
            candidates = self.sec.discover_companies(sector, limit=20)
        except Exception as e:  # noqa: BLE001 — never let discovery break the request
            print(f"Partnership sector discovery failed for {sector!r}: {e}")
            candidates = []

        resolved = [self.resolve_company(name) for name in candidates]
        # CRITICAL LIMIT: sort by total mention count desc and keep only the
        # Top N so a broad sector query can never flood the frontend.
        resolved.sort(key=lambda c: c.get("mention_count", 0), reverse=True)
        return {
            "query": sector,
            "type": "sector",
            "company_count": len(resolved),
            "companies": resolved[:top_n],
        }

    def _resolve_research(self, company_name: str) -> dict:
        """takes: a company name,
        does: queries PubMed for UNC Chapel Hill co-authored papers mentioning
              the company,
        returns: a dict of paper_count, top_authors, and verbatim papers
                 (title, PMID, authors, journal, year, url)."""
        papers = self.pubmed.search_unc_with_company(company_name, max_results=8)
        author_counts: dict = {}
        for paper in papers:
            for author in paper.get("authors", []) or []:
                author_counts[author] = author_counts.get(author, 0) + 1
        top_authors = [
            {"name": name, "papers": count}
            for name, count in sorted(author_counts.items(), key=lambda kv: -kv[1])
        ][:5]
        return {
            "paper_count": len(papers),
            "top_authors": top_authors,
            "papers": papers,
        }

    def _resolve_financial(self, company_name: str) -> dict:
        """takes: a company name,
        does: pulls the company's recent 10-K / 8-K / DEF 14A from SEC EDGAR
              and extracts the EXACT sentences mentioning UNC,
        returns: a dict listing each filing with its verbatim UNC quotes and a
                 source URL for clinical validation."""
        facts = self.sec.get_company_facts(company_name)
        if not facts.get("is_public"):
            return {"is_public": False, "legal_name": facts.get("legal_name", company_name), "filings": []}

        cik = str(facts.get("cik") or "")
        by_form = facts.get("filings_by_form") or {}
        filings_out: List[dict] = []

        # 10-K narrative — the company's own description of its business.
        tenk_text = self.sec.get_tenk_text(cik, by_form)
        tenk_quotes = _extract_unc_sentences(tenk_text)
        tenk_list = by_form.get("10-K") or []
        if tenk_quotes and tenk_list:
            filings_out.append({
                "form": "10-K",
                "date": tenk_list[0].get("date", ""),
                "url": tenk_list[0].get("url", ""),
                "quotes": tenk_quotes,
            })

        # DEF 14A proxy statements — board / executive UNC affiliations.
        for proxy in (by_form.get("DEF 14A") or [])[:2]:
            url = proxy.get("url", "")
            doc_url = self.sec._resolve_proxy_doc_url(url)
            if not doc_url or doc_url.lower().endswith(".pdf"):
                continue
            raw = self.sec._fetch_proxy_bytes(doc_url, max_bytes=800_000)
            quotes = _extract_unc_sentences(_strip_proxy_html(raw)) if raw else []
            if quotes:
                filings_out.append({
                    "form": "DEF 14A",
                    "date": proxy.get("date", ""),
                    "url": url,
                    "quotes": quotes,
                })

        return {
            "is_public": True,
            "legal_name": facts.get("legal_name", company_name),
            "edgar_url": facts.get("edgar_url", ""),
            "filings": filings_out,
        }

    def _resolve_ecosystem(self, company_name: str) -> dict:
        """takes: a company name,
        does: runs a `site:unc.edu "<company>"` web search for official UNC
              press releases or lab pages mentioning the company,
        returns: a dict of mentions (title + url) from the unc.edu domain."""
        query = f'site:unc.edu "{company_name}"'
        try:
            results = self.web.search_company_news(query)
        except Exception as e:  # noqa: BLE001
            print(f"Ecosystem web search failed for {company_name!r}: {e}")
            results = []
        mentions = [
            {"title": r.get("title", ""), "url": r.get("url", "")}
            for r in results
            if r.get("url")
        ]
        return {"mentions": mentions}


def _safe(future, label: str, default):
    """takes: a Future, a label string, and a default value,
    does: resolves the future, swallowing any error after logging it,
    returns: the future's result, or the default on failure."""
    try:
        return future.result()
    except Exception as e:  # noqa: BLE001
        print(f"Partnership resolver {label} failed: {e}")
        return default
