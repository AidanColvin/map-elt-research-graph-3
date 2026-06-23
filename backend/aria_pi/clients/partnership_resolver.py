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

import logging
import math
import re
import unicodedata
from datetime import datetime
from urllib.parse import quote_plus
from concurrent.futures import ThreadPoolExecutor, as_completed

from aria_pi.clients.pubmed_client import PubMedClient
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.web_search_client import WebSearchClient
from aria_pi.clients.nih_reporter_client import NIHReporterClient, unc_pis_from_grants, fetch_unc_faculty_leads
from aria_pi.clients.clinicaltrials_client import ClinicalTrialsClient, fetch_unc_sponsored_trials
from aria_pi.clients.patents import fetch_unc_patents
from aria_pi.clients.relationship_detector import fetch_relationship_signals
from aria_pi.clients.strategic_overlap import find_strategic_overlap
from aria_pi.clients.openalex_client import search_unc_coauthorship
from aria_pi.clients.partnership_fit import build_fit, infer_domain_tags
from aria_pi.sectors import (
    canonical_sector, SECTOR_SEEDS, SECTOR_NC_SEEDS, DEFAULT_SEEDS,
)
from aria_pi.utils.name_resolver import normalize_company_name

logger = logging.getLogger(__name__)

_COI_WINDOW_YEARS = 5  # COI disclosures must be within the last N years

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
#       the verbatim UNC sentences; the raw 10-K text is kept internally for
#       strategic-overlap scoring and is never shipped to the client
# returns: a dict { quotes, filing_url, cik, tenk_text, tenk_url }
def resolve_sec_verbatim(company_name: str, sec: SECEdgarClient) -> dict:
    try:
        cik = sec._find_cik(company_name)
        if not cik:
            return {"quotes": [], "filing_url": "", "cik": "", "tenk_text": "", "tenk_url": ""}
        text = sec.get_tenk_text(cik, {})
        quotes = _extract_unc_sentences(text)
        tenk_url = sec._latest_tenk_url(cik) if text else ""
        filing_url = tenk_url if quotes else ""
        return {"quotes": quotes, "filing_url": filing_url, "cik": cik,
                "tenk_text": text, "tenk_url": tenk_url}
    except Exception as e:
        logger.error("partnership_resolver: SEC verbatim failed for %s: %s", company_name, e)
        return {"quotes": [], "filing_url": "", "cik": "", "tenk_text": "", "tenk_url": ""}


# takes: a company name (str), a PubMedClient
# does: finds UNC ↔ company co-authored papers and tallies the most frequent
#       author names across them
# returns: a dict { count: int, top_authors: [str], papers: [paper dicts] }
_ORG_WORDS = {
    "association", "society", "institute", "foundation", "group", "committee",
    "network", "consortium", "european", "american", "national", "international",
    "academy", "organization", "organisation", "programme", "program", "federation",
    "center", "centre", "university", "college", "hospital", "clinic", "working",
    "collaborative", "collaboration", "task", "force", "board", "council",
    "panel", "team",
}


def _is_person_name(name: str) -> bool:
    """Return True if name looks like a person (Last FI or First Last), not an org."""
    words = name.split()
    if len(words) > 5:
        return False
    lower_words = {w.lower().rstrip(".,") for w in words}
    if lower_words & _ORG_WORDS:
        return False
    return True


def _ascii_fold(s: str) -> str:
    """Strip diacritics so 'Tüfekçi' and 'Tufekci' compare equal."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


_TITLE_PREFIX_RE = re.compile(
    r"^(author\s+)?(correction|erratum|reply|comment|editorial|response)\b[:\-\s]*", re.I
)


def _title_fingerprint(title: str) -> str:
    """Normalize a paper title to a dedupe key: drop an 'Erratum:'/'Reply' lead,
    lowercase, and strip every non-alphanumeric so cross-source punctuation and
    casing differences collapse to one identity."""
    t = _TITLE_PREFIX_RE.sub("", title or "")
    return re.sub(r"[^a-z0-9]", "", t.lower())


def _doi_key(doi: str) -> str:
    """Normalize a DOI to a comparable key (lowercased, scheme/host stripped)."""
    if not doi:
        return ""
    d = doi.lower().strip()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    return d


def _display_name(name: str) -> str:
    """Normalize a name for display: reorder a 'Last, First' form to 'First Last'
    (OpenAlex occasionally returns 'Chen, Tianlong')."""
    n = " ".join((name or "").split())
    if "," in n:
        last, first = (x.strip() for x in n.split(",", 1))
        if last and first and " " not in last:        # looks like "Last, First[ M]"
            n = f"{first} {last}"
    return n


def _person_key(name: str):
    """Collapse author-name variants to one identity: PubMed's "Rowe SP",
    OpenAlex's "Steven P. Rowe", "Chen, Tianlong", and accented "Tüfekçi" all
    resolve to one (last name, first initial) key.
    """
    n = _ascii_fold(_display_name(name)).replace(".", "")
    parts = n.split()
    if not parts:
        return (name.lower(),)
    if len(parts) >= 2 and parts[-1].isupper() and len(parts[-1]) <= 3:
        # PubMed form: trailing token is the initials block.
        return (" ".join(parts[:-1]).lower(), parts[-1][0].lower())
    return (parts[-1].lower(), parts[0][0].lower())


def _name_richness(name: str) -> int:
    """Prefer the spelled-out form ("Steven P. Rowe") over initials ("Rowe SP")
    when both name a person — more lowercase letters = more informative."""
    return sum(1 for ch in name if ch.islower())


def _paper_weight(total_authors) -> float:
    """Down-weight a co-authorship on a giant multi-institution paper.

    A UNC author on a 4-person study is a meaningful collaborator; one of 80
    signatories on a consortium "vision statement" is not. Papers with > 15
    authors get 1/log2(n) credit so a single mega-consortium paper can't
    manufacture five "top contacts".
    """
    n = total_authors or 0
    if n > 15:
        return 1.0 / math.log2(n)
    return 1.0


def _unc_top_authors(papers: list) -> list:
    """Rank the named UNC authors across a set of verified co-authored papers.

    Tallies ``unc_authors`` (authors whose OWN affiliation is UNC Chapel Hill),
    NOT every co-author — so the contact list never shows a paper's unrelated
    non-UNC first author as a "UNC Research Contact". Names are deduped across
    PubMed/OpenAlex spelling differences (keeping the most informative form),
    and credit is down-weighted for huge-consortium papers.
    """
    counts, display = {}, {}
    for p in papers:
        weight = _paper_weight(p.get("total_authors"))
        seen = set()
        for a in p.get("unc_authors") or []:
            if not _is_person_name(a):
                continue
            key = _person_key(a)
            if key in seen:                       # one credit per paper per person
                continue
            seen.add(key)
            counts[key] = counts.get(key, 0) + weight
            if key not in display or _name_richness(a) > _name_richness(display[key]):
                display[key] = a
    ordered = sorted(counts.items(), key=lambda kv: -kv[1])
    return [_display_name(display[key]) for key, _ in ordered][:5]


def resolve_pubmed(company_name: str, pubmed: PubMedClient) -> dict:
    try:
        papers = pubmed.search_unc_with_company(company_name, max_results=8) or []
        return {"count": len(papers),
                "top_authors": _unc_top_authors(papers),
                "papers": papers}
    except Exception as e:
        logger.error("partnership_resolver: PubMed resolve failed for %s: %s", company_name, e)
        return {"count": 0, "top_authors": [], "papers": []}


# takes: a company name (str), a PubMedClient
# does: finds UNC-authored papers that DISCLOSE a financial relationship with the
#       company (consulting fees, equity, research funding) and keeps only those
#       published within the last 5 years — the window in which such conflicts
#       must be disclosed
# returns: a dict { count: int, papers: [paper dicts], window_years: int }
def resolve_coi(company_name: str, pubmed: PubMedClient) -> dict:
    try:
        papers = pubmed.search_coi_disclosures(company_name, max_results=6) or []
        cutoff = datetime.now().year - _COI_WINDOW_YEARS
        recent = []
        for p in papers:
            yr = p.get("year")
            try:
                if not yr or int(yr) >= cutoff:
                    recent.append(p)
            except ValueError:
                recent.append(p)
        return {"count": len(recent), "papers": recent, "window_years": _COI_WINDOW_YEARS}
    except Exception as e:
        logger.error("partnership_resolver: COI resolve failed for %s: %s", company_name, e)
        return {"count": 0, "papers": [], "window_years": _COI_WINDOW_YEARS}


# takes: a company name (str), a PubMedClient
# does: attributes co-authored papers to specific UNC schools/centers so the
#       relationship can be traced to a concrete unit (and its web page)
# returns: a list of { unit: str, count: int } sorted by count desc
def resolve_unc_units(company_name: str, pubmed: PubMedClient) -> list:
    try:
        hits = pubmed.search_by_unc_schools(company_name, max_per_school=3) or []
        tally = {}
        for h in hits:
            unit = h.get("unc_school")
            if unit:
                tally[unit] = tally.get(unit, 0) + 1
        return [{"unit": u, "count": c} for u, c in sorted(tally.items(), key=lambda kv: -kv[1])]
    except Exception as e:
        logger.error("partnership_resolver: UNC units resolve failed for %s: %s", company_name, e)
        return []


# takes: a company name (str) and an optional SEC CIK (str)
# does: builds direct external links to the primary sources a reviewer can open
#       (PubMed search, SEC EDGAR company page, and a unc.edu web search)
# returns: a dict of { pubmed, edgar, unc_web } URLs
def build_links(company_name: str, cik: str = "") -> dict:
    q = quote_plus(company_name)
    pubmed = (f"https://pubmed.ncbi.nlm.nih.gov/?term="
              f"{quote_plus(company_name + ' AND University of North Carolina[Affiliation]')}")
    edgar = (f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K"
             if cik else f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={q}&type=10-K")
    unc_web = f"https://www.google.com/search?q={quote_plus('site:unc.edu ' + chr(34) + company_name + chr(34))}"
    return {"pubmed": pubmed, "edgar": edgar, "unc_web": unc_web}


# takes: a company name (str), a WebSearchClient
# does: queries `site:unc.edu "<company>"` for official UNC web mentions
# returns: a list of { title, url } result dicts (empty without a search key)
def resolve_ecosystem(company_name: str, web: WebSearchClient) -> list:
    try:
        return web.search_unc_site_mentions(company_name)
    except Exception as e:
        logger.error("partnership_resolver: ecosystem resolve failed for %s: %s", company_name, e)
        return []


# takes: a company name (str)
# does: fans out concurrently to PubMed, SEC, and web search, gathering only
#       verifiable, source-linked partnership evidence for that one company
# returns: the full company partnership record (clinical / financial / ecosystem)
# takes: a company name (str), a PubMedClient
# does: runs the three PubMed lookups (co-authored, COI, UNC units) SEQUENTIALLY
#       so the burst never trips NCBI's keyless 3-requests/sec rate limit
# returns: a dict { clinical, coi, unc_units }
def resolve_pubmed_bundle(company_name: str, pubmed: PubMedClient) -> dict:
    return {
        "clinical": resolve_pubmed(company_name, pubmed),
        "coi": resolve_coi(company_name, pubmed),
        "unc_units": resolve_unc_units(company_name, pubmed),
    }


# takes: a company name (str) and an NIHReporterClient
# does: fetches UNC-awarded NIH grants whose text mentions the company and the
#       named UNC PIs on those grants
# returns: a dict { grants: [grant dicts], pis: [PI dicts] } — safe-empty on error
def safe_nih(company_name: str, client: NIHReporterClient) -> dict:
    """Fetch NIH grants mentioning company at UNC. Returns safe empty on failure."""
    try:
        grants = client.unc_grants_mentioning(company_name, max_results=5) or []
        if not grants:
            logger.warning("partnership_resolver: safe_nih returned 0 grants for %s", company_name)
        pis = unc_pis_from_grants(grants, limit=3)
        return {"grants": grants, "pis": pis}
    except Exception as e:
        logger.error("partnership_resolver: NIH safe_nih failed for %s: %s", company_name, e)
        return {"grants": [], "pis": []}


# takes: a company name (str) and a ClinicalTrialsClient
# does: finds trials the company sponsors and keeps the subset where UNC is a
#       listed site/collaborator (unc_signal is the matched facility/collab name)
# returns: a dict { all_count: int, unc_trials: [trial dicts] } — safe-empty on error
def safe_trials(company_name: str, client: ClinicalTrialsClient) -> dict:
    """Fetch clinical trials where company sponsors and UNC is a site. Returns safe empty on failure."""
    try:
        all_trials = client.search_by_sponsor(company_name) or []
        unc_trials = [t for t in all_trials if t.get("unc_signal")]
        return {"all_count": len(all_trials), "unc_trials": unc_trials[:4]}
    except Exception as e:
        logger.error("partnership_resolver: trials safe_trials failed for %s: %s", company_name, e)
        return {"all_count": 0, "unc_trials": []}


# takes: the user's company query (str) and an optional resolved official name
#        (str) to feed the strict SEC/Web clients
# does: fans out concurrently — PubMed gets the ORIGINAL query (it tolerates
#       typos), while SEC EDGAR + web search get the resolved official name so a
#       small typo no longer returns nothing from the exact-match clients. NIH
#       RePORTER + ClinicalTrials.gov add grant/trial-level UNC signals.
# returns: the full company partnership record, including `resolved_name`
def resolve_company(company_name: str, sec_web_name: str = None) -> dict:
    target = sec_web_name or company_name
    pubmed, sec, web = PubMedClient(), SECEdgarClient(), WebSearchClient()
    nih_client, trials_client = NIHReporterClient(), ClinicalTrialsClient()
    results = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {
            ex.submit(resolve_pubmed_bundle, company_name, pubmed): "pubmed",
            ex.submit(resolve_sec_verbatim, target, sec): "financial",
            ex.submit(resolve_ecosystem, target, web): "ecosystem",
            ex.submit(safe_nih, company_name, nih_client): "nih_grants",
            ex.submit(safe_trials, target, trials_client): "trials",
            ex.submit(search_unc_coauthorship, company_name): "openalex",
        }
        for fut in as_completed(futures):
            results[futures[fut]] = fut.result()
    bundle = results.get("pubmed") or {}
    results["clinical"] = bundle.get("clinical")
    results["coi"] = bundle.get("coi")
    results["unc_units"] = bundle.get("unc_units")
    clinical = results.get("clinical") or {"count": 0, "top_authors": [], "papers": []}
    # Merge OpenAlex papers into clinical, deduped by lowercased title so a
    # paper found in both PubMed and OpenAlex is not counted twice.
    openalex_papers = results.get("openalex") or []
    # Merge PubMed + OpenAlex and dedupe on a normalized title fingerprint (and
    # DOI when present). The old key was the raw lowercased title, so the same
    # work counted twice whenever punctuation/casing differed across sources or
    # an "Erratum:"/"Reply" variant appeared — inflating paper counts ~2x.
    merged, seen = [], set()
    for p in (clinical["papers"] or []) + openalex_papers:
        keys = {k for k in (_doi_key(p.get("doi")), _title_fingerprint(p.get("title", ""))) if k}
        if keys & seen:
            continue
        seen |= keys
        merged.append(p)
    clinical["papers"] = merged
    clinical["count"] = len(merged)
    # Re-rank UNC contacts across the deduped PubMed + OpenAlex set so a UNC
    # author found only via OpenAlex is also surfaced.
    clinical["top_authors"] = _unc_top_authors(merged)
    coi = results.get("coi") or {"count": 0, "papers": [], "window_years": _COI_WINDOW_YEARS}
    unc_units = results.get("unc_units") or []
    financial = results.get("financial") or {"quotes": [], "filing_url": "", "cik": ""}
    # The raw 10-K text and bare 10-K URL are internal scoring inputs — pop them
    # off so the (large) filing text never serializes to the frontend.
    tenk_text = financial.pop("tenk_text", "")
    tenk_url = financial.pop("tenk_url", "")
    ecosystem = results.get("ecosystem") or []
    nih = results.get("nih_grants") or {"grants": [], "pis": []}
    trials = results.get("trials") or {"all_count": 0, "unc_trials": []}
    unc_faculty_leads = fetch_unc_faculty_leads(company_name)
    if not unc_faculty_leads:
        logger.warning("partnership_resolver: unc_faculty_leads empty for %s", company_name)
    unc_patents = fetch_unc_patents(company_name)
    unc_joint_trials = fetch_unc_sponsored_trials(target)
    relationship_signals = fetch_relationship_signals(
        company_name, financial, coi, trials["unc_trials"]
    )

    # Partnership Fit — which UNC unit fits, what the tie looks like (or could),
    # and why. Only pay for a SIC lookup when the company can't already be
    # classified from the curated map or the units it co-publishes with.
    sic = ""
    if not infer_domain_tags(company_name):
        sic = sec.sic_for_cik(financial.get("cik", ""))
    fit = build_fit(target, sic, unc_units, nih["grants"],
                    clinical["papers"], trials["unc_trials"])

    # Strategic Overlap — match the company's 10-K Item 1A risk language against
    # the UNC research TITLES we hold (papers, grants, trials). Surfaces only on
    # a real lexical match, so a weak or absent overlap yields None.
    research_titles = (
        [{"title": p.get("title", ""), "source_type": "paper"} for p in clinical["papers"]]
        + [{"title": g.get("title", ""), "source_type": "grant"} for g in nih["grants"]]
        + [{"title": t.get("title", ""), "source_type": "trial"} for t in trials["unc_trials"]]
    )
    strategic_overlap = find_strategic_overlap(tenk_text, research_titles, tenk_url)

    return {
        "query": company_name,
        "resolved_name": target,
        "type": "company",
        "links": build_links(target, financial.get("cik", "")),
        "clinical": clinical,
        "coi": coi,
        "unc_units": unc_units,
        "financial": financial,
        "ecosystem": ecosystem,
        "nih_grants": nih["grants"],
        "nih_pis": nih["pis"],
        "trials": trials["unc_trials"],
        "trials_total": trials["all_count"],
        "unc_faculty_leads": unc_faculty_leads,
        "unc_patents": unc_patents,
        "unc_joint_trials": unc_joint_trials,
        "relationship_signals": relationship_signals,
        "strategic_overlap": strategic_overlap,
        "fit": fit,
        "mention_count": clinical["count"] + coi["count"] + len(financial["quotes"]) + len(ecosystem),
    }


# takes: a sector name (str)
# does: evaluates the sector's seed companies for UNC partnership evidence,
#       ranks them by total verifiable mention count, and keeps only the Top 10
#       (CRITICAL LIMIT) so the payload stays small; aggregates their evidence
#       into the same three buckets the company view uses
# returns: the sector partnership record (ranked companies + aggregated buckets)
def _sector_seeds(sector: str) -> list:
    """Seed companies for a sector query, in priority order:
      1. curated   — the term maps to one of our canonical sectors (hand-picked
                     global list + NC-specific companies).
      2. discovered — any other free-text term ("diabetes", "clean energy"):
                     pull real, on-topic public companies live from SEC EDGAR.
      3. default   — only if discovery returns nothing.
    Without step 2, every unmapped term fell back to the same generic megacaps
    (Apple/Microsoft/Amazon/Alphabet/JPMorgan), so "diabetes" and "neuroscience"
    produced identical, off-topic reports.
    """
    canon = canonical_sector(sector)
    if canon and canon in SECTOR_SEEDS:
        global_seeds = SECTOR_SEEDS[canon]
        nc_extras = [c for c in SECTOR_NC_SEEDS.get(canon, []) if c not in global_seeds]
        return global_seeds + nc_extras
    try:
        discovered = SECEdgarClient().discover_companies(sector, limit=_SECTOR_FANOUT)
    except Exception as e:
        logger.warning("partnership_resolver: sector discovery failed for %s: %s", sector, e)
        discovered = []
    return discovered or DEFAULT_SEEDS


def resolve_sector(sector: str) -> dict:
    seeds = (_sector_seeds(sector) or [])[:_SECTOR_FANOUT]
    records = []
    # Keep concurrency low: each company already runs its PubMed lookups
    # sequentially, so too many parallel companies would still trip NCBI's rate
    # limit and zero out results.
    with ThreadPoolExecutor(max_workers=3) as ex:
        futures = {ex.submit(resolve_company, name): name for name in seeds}
        for fut in as_completed(futures):
            try:
                records.append(fut.result())
            except Exception as e:
                logger.error("partnership_resolver: sector company resolve failed: %s", e)
    records.sort(key=lambda r: r["mention_count"], reverse=True)
    top = records[:_SECTOR_TOP]

    clinical_papers, top_authors, financial_quotes, ecosystem, coi_papers = [], [], [], [], []
    nih_grants, nih_pis, sector_trials = [], [], []
    trials_total = 0
    pi_seen = set()
    unit_tally = {}
    for r in top:
        for p in (r["clinical"]["papers"] or [])[:2]:
            clinical_papers.append({**p, "company": r["query"]})
        top_authors.extend(r["clinical"]["top_authors"])
        for p in (r.get("coi", {}).get("papers") or [])[:2]:
            coi_papers.append({**p, "company": r["query"]})
        for u in (r.get("unc_units") or []):
            unit_tally[u["unit"]] = unit_tally.get(u["unit"], 0) + u["count"]
        for q in r["financial"]["quotes"]:
            financial_quotes.append({"company": r["query"], "text": q, "filing_url": r["financial"]["filing_url"]})
        for m in (r["ecosystem"] or [])[:2]:
            ecosystem.append({**m, "company": r["query"]})
        # Aggregate the institution-level signals the company view shows but the
        # sector view previously dropped — NIH grants, the UNC PIs behind them,
        # and clinical trials where UNC is a site. Without these the sector
        # report always read "0 NIH grants / 0 UNC trials" regardless of reality.
        for g in (r.get("nih_grants") or [])[:3]:
            nih_grants.append({**g, "company": r["query"]})
        for pi in (r.get("nih_pis") or []):
            key = (pi.get("name") or "").lower()
            if key and key not in pi_seen:
                pi_seen.add(key)
                nih_pis.append(pi)
        for t in (r.get("trials") or [])[:3]:
            sector_trials.append({**t, "company": r["query"]})
        trials_total += r.get("trials_total") or 0

    return {
        "query": sector,
        "resolved_name": sector,
        "type": "sector",
        "links": build_links(sector),
        "companies": [{"name": r["query"], "mention_count": r["mention_count"]} for r in top],
        "clinical": {
            "count": sum(r["clinical"]["count"] for r in top),
            "top_authors": list(dict.fromkeys(top_authors))[:8],
            "papers": clinical_papers[:12],
        },
        "coi": {
            "count": sum(r.get("coi", {}).get("count", 0) for r in top),
            "papers": coi_papers[:10],
            "window_years": _COI_WINDOW_YEARS,
        },
        "unc_units": [{"unit": u, "count": c} for u, c in sorted(unit_tally.items(), key=lambda kv: -kv[1])],
        "financial": {"quotes": financial_quotes[:10], "filing_url": ""},
        "ecosystem": ecosystem[:10],
        "nih_grants": nih_grants[:12],
        "nih_pis": nih_pis[:8],
        "trials": sector_trials[:12],
        "trials_total": trials_total,
    }


# takes: a query string and a type ("company" | "sector")
# does: dispatches to the company or sector resolver
# returns: the resolver record dict for that query
def resolve_partnerships(query: str, type: str) -> dict:
    query = (query or "").strip()
    if not query:
        return {"query": "", "resolved_name": "", "type": type, "links": build_links(""),
                "clinical": {"count": 0, "top_authors": [], "papers": []},
                "coi": {"count": 0, "papers": [], "window_years": _COI_WINDOW_YEARS},
                "unc_units": [], "financial": {"quotes": [], "filing_url": ""}, "ecosystem": []}
    if type == "sector":
        return resolve_sector(query)
    # Correct typos before the strict SEC/Web clients see the name; PubMed still
    # receives the original query inside resolve_company.
    resolved = normalize_company_name(query)
    return resolve_company(query, sec_web_name=resolved)
