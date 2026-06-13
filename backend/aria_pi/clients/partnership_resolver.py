"""Partnership resolver — verifiable UNC ↔ company/sector links only.

Every fact returned here is tied to a verbatim source: a PubMed PMID + paper
title, an exact SEC filing sentence, or an official unc.edu web mention. There
are NO AI-generated summaries — the frontend renders the raw quotes so a
clinical reviewer can validate each claim against its primary source.

The resolver fans out to the existing free, keyless clients (PubMed, SEC EDGAR)
plus the optional web-search client. Sector queries are capped: companies are
ranked by total verifiable mention count and only the Top 10 are returned, so
the frontend payload can never balloon.
"""

import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from aria_pi.clients.pubmed_client import PubMedClient
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.web_search_client import WebSearchClient
from aria_pi.sectors import seeds_for

# UNC mention patterns used for verbatim SEC extraction.
_UNC_PATTERNS = [
    r"University of North Carolina",
    r"UNC[-\s]Chapel Hill",
    r"UNC Health",
    r"\bUNC\b",
]
_UNC_RE = re.compile("|".join(_UNC_PATTERNS))
_SECTOR_FANOUT = 12   # how many seed companies to evaluate for a sector query
_SECTOR_TOP = 10      # CRITICAL LIMIT: only the top-N ranked companies returned


# takes: a block of filing text (str)
# does: splits it into sentences and keeps only those that name UNC verbatim,
#       trimming each to a readable length
# returns: a list of verbatim sentence strings (deduped, max 3)
def _extract_unc_sentences(text: str) -> list:
    if not text:
        return []
    flat = re.sub(r"\s+", " ", text)
    sentences = re.split(r"(?<=[.!?])\s+", flat)
    out, seen = [], set()
    for s in sentences:
        if _UNC_RE.search(s):
            clean = s.strip()[:480]
            key = clean.lower()
            if clean and key not in seen:
                seen.add(key)
                out.append(clean)
        if len(out) >= 3:
            break
    return out


# takes: a company name (str), an SECEdgarClient
# does: locates the company's CIK, pulls its latest 10-K narrative, and extracts
#       the verbatim sentences that mention UNC, with the filing URL as source
# returns: a dict { quotes: [str], filing_url: str, cik: str }
def resolve_sec_verbatim(company_name: str, sec: SECEdgarClient) -> dict:
    try:
        cik = sec._find_cik(company_name)
        if not cik:
            return {"quotes": [], "filing_url": "", "cik": ""}
        text = sec.get_tenk_text(cik, {})
        quotes = _extract_unc_sentences(text)
        filing_url = sec._latest_tenk_url(cik) if quotes else ""
        return {"quotes": quotes, "filing_url": filing_url, "cik": cik}
    except Exception as e:
        print(f"SEC verbatim error for {company_name}: {e}")
        return {"quotes": [], "filing_url": "", "cik": ""}


# takes: a company name (str), a PubMedClient
# does: finds UNC ↔ company co-authored papers and tallies the most frequent
#       author names across them
# returns: a dict { count: int, top_authors: [str], papers: [paper dicts] }
def resolve_pubmed(company_name: str, pubmed: PubMedClient) -> dict:
    try:
        papers = pubmed.search_unc_with_company(company_name, max_results=8) or []
        tally = {}
        for p in papers:
            for a in p.get("authors") or []:
                tally[a] = tally.get(a, 0) + 1
        top_authors = [a for a, _ in sorted(tally.items(), key=lambda kv: -kv[1])[:5]]
        return {"count": len(papers), "top_authors": top_authors, "papers": papers}
    except Exception as e:
        print(f"PubMed resolve error for {company_name}: {e}")
        return {"count": 0, "top_authors": [], "papers": []}


# takes: a company name (str), a WebSearchClient
# does: queries `site:unc.edu "<company>"` for official UNC web mentions
# returns: a list of { title, url } result dicts (empty without a search key)
def resolve_ecosystem(company_name: str, web: WebSearchClient) -> list:
    try:
        return web.search_unc_site_mentions(company_name)
    except Exception as e:
        print(f"Ecosystem resolve error for {company_name}: {e}")
        return []


# takes: a company name (str)
# does: fans out concurrently to PubMed, SEC, and web search, gathering only
#       verifiable, source-linked partnership evidence for that one company
# returns: the full company partnership record (clinical / financial / ecosystem)
def resolve_company(company_name: str) -> dict:
    pubmed, sec, web = PubMedClient(), SECEdgarClient(), WebSearchClient()
    results = {}
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {
            ex.submit(resolve_pubmed, company_name, pubmed): "clinical",
            ex.submit(resolve_sec_verbatim, company_name, sec): "financial",
            ex.submit(resolve_ecosystem, company_name, web): "ecosystem",
        }
        for fut in as_completed(futures):
            results[futures[fut]] = fut.result()
    clinical = results.get("clinical") or {"count": 0, "top_authors": [], "papers": []}
    financial = results.get("financial") or {"quotes": [], "filing_url": "", "cik": ""}
    ecosystem = results.get("ecosystem") or []
    return {
        "query": company_name,
        "type": "company",
        "clinical": clinical,
        "financial": financial,
        "ecosystem": ecosystem,
        "mention_count": clinical["count"] + len(financial["quotes"]) + len(ecosystem),
    }


# takes: a sector name (str)
# does: evaluates the sector's seed companies for UNC partnership evidence,
#       ranks them by total verifiable mention count, and keeps only the Top 10
#       (CRITICAL LIMIT) so the payload stays small; aggregates their evidence
#       into the same three buckets the company view uses
# returns: the sector partnership record (ranked companies + aggregated buckets)
def resolve_sector(sector: str) -> dict:
    seeds = (seeds_for(sector) or [])[:_SECTOR_FANOUT]
    records = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(resolve_company, name): name for name in seeds}
        for fut in as_completed(futures):
            try:
                records.append(fut.result())
            except Exception as e:
                print(f"Sector company error: {e}")
    records.sort(key=lambda r: r["mention_count"], reverse=True)
    top = records[:_SECTOR_TOP]

    clinical_papers, top_authors, financial_quotes, ecosystem = [], [], [], []
    for r in top:
        for p in (r["clinical"]["papers"] or [])[:2]:
            clinical_papers.append({**p, "company": r["query"]})
        top_authors.extend(r["clinical"]["top_authors"])
        for q in r["financial"]["quotes"]:
            financial_quotes.append({"company": r["query"], "text": q, "filing_url": r["financial"]["filing_url"]})
        for m in (r["ecosystem"] or [])[:2]:
            ecosystem.append({**m, "company": r["query"]})

    return {
        "query": sector,
        "type": "sector",
        "companies": [{"name": r["query"], "mention_count": r["mention_count"]} for r in top],
        "clinical": {
            "count": sum(r["clinical"]["count"] for r in top),
            "top_authors": list(dict.fromkeys(top_authors))[:8],
            "papers": clinical_papers[:12],
        },
        "financial": {"quotes": financial_quotes[:10], "filing_url": ""},
        "ecosystem": ecosystem[:10],
    }


# takes: a query string and a type ("company" | "sector")
# does: dispatches to the company or sector resolver
# returns: the resolver record dict for that query
def resolve_partnerships(query: str, type: str) -> dict:
    query = (query or "").strip()
    if not query:
        return {"query": "", "type": type, "clinical": {"count": 0, "top_authors": [], "papers": []},
                "financial": {"quotes": [], "filing_url": ""}, "ecosystem": []}
    if type == "sector":
        return resolve_sector(query)
    return resolve_company(query)
