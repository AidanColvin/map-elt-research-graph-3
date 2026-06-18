"""SEC EDGAR client — fully free, no API key required.

Uses two SEC endpoints:
  1. efts.sec.gov/LATEST/search-index  — full-text filing search
  2. data.sec.gov/submissions/CIK{cik}.json  — rich company submissions
"""
import html as _html
import logging
import re
import threading
import time
import requests
from datetime import date, timedelta
from typing import Optional, List

from aria_pi.utils.net_guard import assert_public_url
from aria_pi.lib.tickers import load_tickers

logger = logging.getLogger(__name__)

USER_AGENT = "InnovateCarolina research.intelligence@unc.edu"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

# Process-wide SEC rate limiter. SEC tolerates ~10 requests/second from a
# declared User-Agent and returns 403/429 above it. A sector scan now prefetches
# financials for ~22 companies concurrently (2-3 SEC GETs each), which without a
# shared throttle bursts well past that limit and zeroes out revenue/CIK
# sector-wide. This lock+min-interval mirrors the PubMed client's throttle and
# serializes every SEC GET (across threads) to a safe cadence. Only sec.gov
# hosts are throttled — external company-website scrapes pass through untouched.
_SEC_LOCK = threading.Lock()
_SEC_MIN_INTERVAL = 0.11  # ~9 requests/second, comfortably under SEC's limit
_sec_last_request = [0.0]


def _sec_throttle() -> None:
    """Block until at least _SEC_MIN_INTERVAL has elapsed since the last SEC GET."""
    with _SEC_LOCK:
        wait = _SEC_MIN_INTERVAL - (time.monotonic() - _sec_last_request[0])
        if wait > 0:
            time.sleep(wait)
        _sec_last_request[0] = time.monotonic()


# Generic corporate-suffix and sector words that are NOT discriminating on their
# own. A CIK match must never hinge on one of these alone, or a private company
# hijacks an unrelated public filer that merely shares a common word — e.g.
# "Epic Games" → "Motorsport GAMES Inc." or "clean ENERGY" → some "X Energy Corp".
_GENERIC_NAME_TOKENS = {
    "games", "technologies", "technology", "systems", "holdings", "holding",
    "group", "corp", "corporation", "inc", "incorporated", "company", "co",
    "networks", "network", "solutions", "international", "global", "services",
    "service", "industries", "partners", "capital", "financial", "energy",
    "health", "healthcare", "labs", "digital", "data", "media", "platforms",
    "llc", "ltd", "plc", "the", "and",
}

# Trailing corporate suffixes — a title that is the query plus exactly one of
# these is a near-exact match (e.g. "Coca-Cola" → "COCA-COLA CO", not the longer
# "COCA-COLA EUROPACIFIC PARTNERS PLC" bottler).
_CORP_SUFFIXES = {
    "co", "corp", "corporation", "inc", "incorporated", "company", "plc",
    "ltd", "limited", "lp", "llc", "holdings", "holding", "group", "sa",
    "ag", "nv", "se", "trust", "companies",
}

# Pure corporate-suffix / connector tokens dropped when requiring that ALL
# discriminating query tokens appear in a title. Unlike _GENERIC_NAME_TOKENS this
# does NOT include descriptive words (health, energy, games, networks…): those
# ARE discriminating, so "Atrium Health" must not match "Atrium Therapeutics" and
# "Epic Games" must not match "Motorsport Games" on a single shared token.
_CORP_SUFFIX_TOKENS = {
    "co", "corp", "corporation", "inc", "incorporated", "company", "companies",
    "plc", "ltd", "limited", "llc", "lp", "holdings", "holding", "group",
    "the", "and",
}


def _norm_name(s: str) -> str:
    """Normalize a company name for matching: drop apostrophes/periods, turn all
    other punctuation into spaces, lowercase, collapse whitespace. So "McDonald's",
    "U.S. Bancorp", "Take-Two", "Yum! Brands" all compare cleanly to SEC titles."""
    s = (s or "").lower().replace("'", "").replace("’", "").replace(".", "")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def _active_cik_titles() -> dict:
    """Map {int(cik): official_title} for every currently-traded SEC filer.

    Used to filter full-text search hits down to live, public companies so
    discovery never surfaces defunct shells (e.g. THQ, Midway). Reads the
    shared, cached ticker list from aria_pi.lib.tickers."""
    out: dict = {}
    for t in load_tickers():
        try:
            out[int(t["cik_str"])] = t.get("title") or ""
        except (KeyError, ValueError, TypeError):
            continue
    return out


class SECEdgarClient:
    def __init__(self):
        self.search_url = "https://efts.sec.gov/LATEST/search-index"
        self.submissions_url = "https://data.sec.gov/submissions/CIK{cik}.json"
        self.companyfacts_url = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
        # One pooled connection per client instead of a fresh TCP/TLS handshake
        # on every requests.get; the session carries the standard SEC headers.
        self._session = requests.Session()
        self._session.headers.update(HEADERS)

    def _get(self, url: str, **kwargs):
        """Session GET that respects the process-wide SEC rate limit.

        Throttles only sec.gov hosts (efts/data/www.sec.gov); external company
        websites scraped for leadership bios are not subject to SEC's limit and
        pass straight through so they don't slow the scan.
        """
        if "sec.gov" in (url or ""):
            _sec_throttle()
        return self._session.get(url, **kwargs)

    def discover_companies(self, term: str, limit: int = 10) -> List[str]:
        """Find real, currently-traded public companies for ANY free-text term.

        Strategy: SEC EDGAR full-text search over recent 10-K annual reports
        (the filing where a company describes its own business), then keep only
        hits that resolve to a CIK present in SEC's official ticker map — i.e.
        companies that are actually public and active today. This is what lets
        the pipeline build a genuine, sector-relevant report for searches like
        "pasta" or "video games" instead of falling back to a default list.

        Every returned name resolves cleanly back to a CIK via _find_cik, so the
        downstream SEC/NIH/trial/PubMed lookups all key off real EDGAR data.
        """
        term = (term or "").strip()
        if not term:
            return []
        active = _active_cik_titles()
        if not active:
            return []
        start = date(date.today().year - 4, 1, 1).isoformat()
        end = date.today().isoformat()

        # Try progressively broader queries and stop at the first that yields
        # real companies. A precise phrase ("craft beer") is best when it hits,
        # but many niche terms never appear verbatim in a 10-K; rather than fall
        # back to a generic default list, we relax to the bare words and then to
        # the head noun ("beer") so the report still covers on-topic filers.
        for q in self._discovery_queries(term):
            ranked = self._rank_for_query(q, active, start, end, limit)
            if ranked:
                return ranked
        return []

    @staticmethod
    def _discovery_queries(term: str) -> List[str]:
        """Ordered, de-duplicated query variants from precise to broad."""
        attempts: List[str] = []
        if " " in term:
            attempts.append(f'"{term}"')   # exact phrase — highest precision
            attempts.append(term)          # all words, any position
            tokens = [t for t in re.split(r"[^A-Za-z0-9]+", term) if len(t) > 2]
            if tokens:
                attempts.append(tokens[-1])           # head noun ("beer")
                longest = max(tokens, key=len)
                attempts.append(longest)              # most distinctive token
        else:
            attempts.append(term)
        seen: set = set()
        return [a for a in attempts if not (a in seen or seen.add(a))]

    def _rank_for_query(self, q: str, active: dict, start: str, end: str,
                        limit: int) -> List[str]:
        """Run one efts query over recent 10-Ks and rank matched live filers.

        Pulls a few pages so companies can be RANKED by how often the term
        appears in their filings — a company whose 10-Ks repeatedly match is far
        more on-topic than one with a single incidental mention (which is how
        noise like "Vail Resorts" for "pasta" used to slip in).

        The first page is fetched as a plain query (no `from`) because that form
        is the most reliable; SEC's efts endpoint intermittently 500s on
        paginated/rapid requests, so extra pages are strictly best-effort and a
        later failure never discards earlier hits.
        """
        freq: dict[int, int] = {}
        order: list[int] = []

        def ingest(hits: list) -> None:
            for h in hits:
                for c in (h.get("_source", {}) or {}).get("ciks", []) or []:
                    try:
                        ci = int(c)
                    except (ValueError, TypeError):
                        continue
                    if ci not in active:
                        continue
                    if ci not in freq:
                        order.append(ci)
                    freq[ci] = freq.get(ci, 0) + 1

        base = {"q": q, "forms": "10-K", "startdt": start, "enddt": end}
        for page in range(3):  # ~30 hits total, best-effort
            params = dict(base)
            if page > 0:
                params["from"] = page * 10
                time.sleep(0.35)  # be gentle: efts throttles rapid requests
            try:
                r = self._get(self.search_url,
                                      timeout=8, params=params)
                r.raise_for_status()
                hits = r.json().get("hits", {}).get("hits", []) or []
            except Exception as e:
                logger.warning("SEC discovery error for %r (page %s): %s", q, page, e)
                if page == 0:
                    return []  # genuine failure — nothing to rank
                break          # keep whatever earlier pages returned
            if not hits:
                break
            ingest(hits)

        # Rank by match frequency (desc), then first-appearance (SEC relevance).
        first_seen = {ci: i for i, ci in enumerate(order)}
        ranked = sorted(order, key=lambda ci: (-freq[ci], first_seen[ci]))
        return [active[ci] for ci in ranked[:limit]]

    def get_company_facts(self, company_name: str) -> dict:
        """Search EDGAR for a company and return enriched facts.

        Returns a dict with legal_name, cik, sic, ticker, hq, employees,
        and recent filings (with URLs). Empty fields when SEC has nothing.
        """
        cik = self._find_cik(company_name)
        if not cik:
            # No CIK => not a current SEC filer (e.g. a private company like
            # OpenAI, Anthropic, or Epic Systems). Say so honestly instead of
            # later printing a false "SEC-registered" claim downstream.
            return {"legal_name": company_name, "is_public": False,
                    "source": "https://www.sec.gov"}

        try:
            url = self.submissions_url.format(cik=str(cik).zfill(10))
            r = self._get(url, timeout=6)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            logger.warning("SEC submissions error: %s", e)
            return {"legal_name": company_name, "cik": cik, "source": "https://www.sec.gov"}

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", []) or []
        dates = recent.get("filingDate", []) or []
        accessions = recent.get("accessionNumber", []) or []
        primary_docs = recent.get("primaryDocument", []) or []

        recent_filings = []
        for i in range(min(len(forms), 40)):
            recent_filings.append({
                "form": forms[i],
                "date": dates[i] if i < len(dates) else "",
                "url": _filing_url(cik, accessions[i] if i < len(accessions) else "",
                                   primary_docs[i] if i < len(primary_docs) else ""),
            })

        addresses = data.get("addresses", {}) or {}
        biz = addresses.get("business", {}) or {}
        hq = f"{biz.get('city', '')}, {biz.get('stateOrCountry', '')}".strip(", ")

        # Pull headline financials from XBRL company facts
        xbrl = self._get_xbrl_facts(cik)

        # Separate out specific filing types for prominent display
        by_form: dict[str, list] = {}
        for f in recent_filings:
            by_form.setdefault(f.get("form", "OTHER"), []).append(f)

        edgar_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"
        return {
            "legal_name": data.get("name", company_name),
            "cik": cik,
            "is_public": True,
            "sic": str(data.get("sicDescription") or data.get("sic") or ""),
            "tickers": data.get("tickers", []) or [],
            "exchanges": data.get("exchanges", []) or [],
            "hq": hq,
            "website": data.get("website", "") or "",
            "category": data.get("category", "") or "",
            "entity_type": data.get("entityType", "") or "",
            "fiscal_year_end": data.get("fiscalYearEnd", "") or "",
            "recent_filings": recent_filings,
            "filings_by_form": {
                "10-K": by_form.get("10-K", [])[:3],
                "10-Q": by_form.get("10-Q", [])[:3],
                "8-K": by_form.get("8-K", [])[:5],
                "DEF 14A": by_form.get("DEF 14A", [])[:2],
                "S-1": by_form.get("S-1", [])[:1],
            },
            "edgar_url": edgar_url,
            "xbrl": xbrl,
            "source": "https://www.sec.gov",
        }

    def _get_xbrl_facts(self, cik: str) -> dict:
        """Pull headline financials from SEC's XBRL company-facts endpoint.

        Returns the most recent ANNUAL (10-K) reported value for each concept,
        with the form, accession number, and URL so each fact is independently
        verifiable.
        """
        try:
            url = self.companyfacts_url.format(cik=str(cik).zfill(10))
            r = self._get(url, timeout=6)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            logger.warning("XBRL fetch error for CIK %s: %s", cik, e)
            return {}

        us_gaap = ((data.get("facts") or {}).get("us-gaap") or {})
        dei = ((data.get("facts") or {}).get("dei") or {})

        def latest_annual(concept_name: str, unit: str, source: dict = us_gaap):
            concept = source.get(concept_name) or {}
            entries = ((concept.get("units") or {}).get(unit) or [])
            # Prefer annual filings: 10-K (domestic) or 20-F (foreign private
            # issuers like Spotify). Fall back to most recent of any form.
            annual = [e for e in entries
                      if e.get("form") in ("10-K", "20-F") and e.get("fp") == "FY"]
            pool = annual or entries
            if not pool:
                return None
            pick = max(pool, key=lambda e: e.get("end", ""))
            accn = pick.get("accn", "")
            acc_clean = accn.replace("-", "")
            url = (f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_clean}/"
                   f"{accn}-index.htm") if accn else (
                f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}")
            return {
                "value": pick.get("val"),
                "end": pick.get("end"),
                "fy": pick.get("fy"),
                "form": pick.get("form"),
                "url": url,
            }

        def most_recent(*concept_names: str, unit: str = "USD",
                        src: dict = us_gaap) -> dict | None:
            """Pick the most recent annual value across multiple XBRL concept names.

            The naive `or`-chain stops at the first non-None result even when
            that result is from FY2010 and a later concept has FY2025 data
            (Apple uses SalesRevenueNet through FY2018, then switches to
            RevenueFromContractWithCustomerExcludingAssessedTax).  Collecting
            all candidates and taking the max end-date fixes stale revenue years.
            """
            candidates = []
            for c in concept_names:
                r = latest_annual(c, unit, src)
                if r and r.get("value") is not None and r.get("end"):
                    candidates.append(r)
            if not candidates:
                return None
            return max(candidates, key=lambda r: r.get("end", ""))

        def annual_series(*concept_names: str, unit: str = "USD", src: dict = us_gaap, years: int = 11) -> list:
            """Up to `years` of annual (10-K/FY) values, merged across concept
            names and deduped by fiscal year. Returns [{fy, val}] ascending —
            the time series used for the on-screen trend charts.
            """
            by_fy: dict[int, dict] = {}
            for name in concept_names:
                concept = src.get(name) or {}
                for e in ((concept.get("units") or {}).get(unit) or []):
                    if e.get("form") not in ("10-K", "20-F") or e.get("fp") != "FY":
                        continue
                    fy = e.get("fy")
                    val = e.get("val")
                    if fy is None or val is None:
                        continue
                    # Prefer the later-filed value for a given fiscal year.
                    prev = by_fy.get(fy)
                    if prev is None or (e.get("end", "") > prev.get("end", "")):
                        by_fy[fy] = {"fy": int(fy), "val": val, "end": e.get("end", "")}
            ordered = sorted(by_fy.values(), key=lambda x: x["fy"])[-years:]
            return [{"fy": x["fy"], "val": x["val"]} for x in ordered]

        REV_CONCEPTS = ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
                        "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet",
                        "SalesRevenueGoodsNet", "SalesRevenueServicesNet",
                        # Broker-dealers / investment banks (Goldman Sachs, Morgan
                        # Stanley) report top-line revenue under this concept, not
                        # "Revenues" — without it their revenue came back blank.
                        "RevenuesNetOfInterestExpense")
        # Multi-concept selection (max end-date) for net income and total assets
        # too, so a company that switched XBRL concept names doesn't freeze these
        # at an old fiscal year next to a current-year revenue.
        NET_INCOME_CONCEPTS = ("NetIncomeLoss", "ProfitLoss",
                               "NetIncomeLossAvailableToCommonStockholdersBasic")
        revenue = most_recent(*REV_CONCEPTS)
        return {
            "revenue": revenue,
            "rd_expense": latest_annual("ResearchAndDevelopmentExpense", "USD"),
            "net_income": most_recent(*NET_INCOME_CONCEPTS),
            "cash": latest_annual("CashAndCashEquivalentsAtCarryingValue", "USD"),
            "operating_cash_flow": latest_annual(
                "NetCashProvidedByUsedInOperatingActivities", "USD"),
            "total_assets": most_recent("Assets"),
            "stockholders_equity": latest_annual("StockholdersEquity", "USD"),
            "employees": latest_annual("EntityNumberOfEmployees", "pure", source=dei),
            "shares_outstanding": latest_annual("EntityCommonStockSharesOutstanding", "shares", source=dei),
            "series": {
                "revenue": annual_series(*REV_CONCEPTS),
                "rd_expense": annual_series("ResearchAndDevelopmentExpense"),
                "net_income": annual_series("NetIncomeLoss"),
            },
        }

    def fetch_collaboration_8ks(self, cik: str) -> dict:
        """Deal track record: distinct 8-Ks mentioning collaboration/licensing.

        Runs two EDGAR full-text searches (same efts endpoint and HTTP
        pattern as discovery) over the past two years, filtered to this CIK,
        merges and dedupes hits by filing accession number. Returns safe
        zero/None defaults on any failure — never raises.
        """
        empty = {
            "collaboration_8k_count": 0,
            "most_recent_8k_date": None,
            "most_recent_8k_description": None,
            "collaboration_8k_url": None,
        }
        if not cik:
            return empty
        cik10 = str(cik).zfill(10)
        start = (date.today() - timedelta(days=730)).isoformat()
        end = date.today().isoformat()

        by_adsh: dict = {}
        for q in ('"collaboration agreement"', '"sponsored research"'):
            params = {"q": q, "forms": "8-K", "startdt": start,
                      "enddt": end, "ciks": cik10}
            try:
                r = self._get(self.search_url,
                                      timeout=8, params=params)
                r.raise_for_status()
                hits = r.json().get("hits", {}).get("hits", []) or []
            except Exception as e:
                logger.warning("8-K collaboration search error (%s, CIK %s): %s", q, cik, e)
                continue
            for h in hits:
                src = h.get("_source") or {}
                adsh = src.get("adsh") or ""
                if not adsh or adsh in by_adsh:
                    continue
                # _id is "adsh:filename" — resolves to the actual document.
                fname = (h.get("_id") or "").split(":", 1)[-1]
                url = (f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/"
                       f"{adsh.replace('-', '')}/{fname}") if fname else (
                       f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}")
                by_adsh[adsh] = {
                    "date": src.get("file_date") or "",
                    "description": src.get("file_description")
                                   or src.get("file_type") or "8-K",
                    "url": url,
                }
            time.sleep(0.35)  # be gentle: efts throttles rapid requests

        if not by_adsh:
            return empty
        latest = max(by_adsh.values(), key=lambda f: f["date"])
        return {
            "collaboration_8k_count": len(by_adsh),
            "most_recent_8k_date": latest["date"] or None,
            "most_recent_8k_description": latest["description"] or None,
            "collaboration_8k_url": latest["url"] or None,
        }

    def get_tenk_text(self, cik: str, filings_by_form: dict,
                      max_bytes: int = 600_000) -> str:
        """Plain text of the latest 10-K's narrative, for in-memory scoring.

        Reuses the existing filing-directory resolution and capped streaming
        fetch used for proxy statements. Returns '' on any failure.
        """
        try:
            if not cik:
                return ""
            tenks = (filings_by_form or {}).get("10-K") or []
            url = tenks[0].get("url", "") if tenks else ""
            if not url:
                # Heavy filers bury the last 10-K beyond the 40-filing slice
                # used for filings_by_form — scan the full submissions index.
                url = self._latest_tenk_url(cik)
            if not url:
                return ""
            if not url or "browse-edgar" in url:
                return ""
            doc_url = self._resolve_proxy_doc_url(url)
            if not doc_url or doc_url.lower().endswith(".pdf"):
                return ""
            raw = self._fetch_proxy_bytes(doc_url, max_bytes=max_bytes)
            return _strip_proxy_html(raw) if raw else ""
        except Exception as e:
            logger.warning("10-K text fetch error for CIK %s: %s", cik, e)
            return ""

    def _latest_tenk_url(self, cik: str) -> str:
        """Most recent 10-K document URL from the full submissions index."""
        try:
            url = self.submissions_url.format(cik=str(cik).zfill(10))
            r = self._get(url, timeout=6)
            r.raise_for_status()
            recent = (r.json().get("filings") or {}).get("recent") or {}
            forms = recent.get("form", []) or []
            accessions = recent.get("accessionNumber", []) or []
            docs = recent.get("primaryDocument", []) or []
            for i, form in enumerate(forms):
                if form == "10-K" and i < len(accessions):
                    return _filing_url(cik, accessions[i],
                                       docs[i] if i < len(docs) else "")
        except Exception as e:
            logger.warning("10-K lookup error for CIK %s: %s", cik, e)
        return ""

    def get_unc_alumni_from_proxy(self, cik: str, proxy_filings: list) -> list:
        """Fetch DEF 14A proxy statements and return UNC-educated executives/directors.

        Steps:
          1. Use EDGAR full-text search to check whether UNC is mentioned in
             any recent DEF 14A for this company.  If not, skip parsing.
          2. Resolve directory URLs to the actual .htm document.
          3. Fetch up to 800 KB and parse line-by-line.
        """
        if not cik or not proxy_filings:
            return []

        # Use EDGAR full-text search to check for a UNC mention, but treat
        # a negative as advisory rather than a hard gate — the search only
        # covers filings indexed in the last few years and can miss older
        # proxy statements. When the search confirms a match we skip the
        # fetch only if it explicitly returns False; on any error we proceed.
        if self._unc_mentioned_in_proxy(cik) is False:
            return []

        alumni: list = []
        seen: set = set()
        for filing in proxy_filings[:2]:
            url = filing.get('url', '')
            if not url or 'browse-edgar' in url:
                continue
            doc_url = self._resolve_proxy_doc_url(url)
            if not doc_url or doc_url.lower().endswith('.pdf'):
                continue
            raw = self._fetch_proxy_bytes(doc_url, max_bytes=800_000)
            if not raw:
                continue
            for person in _parse_proxy_for_unc(raw, doc_url):
                key = person['name'].lower().strip()
                if key and key not in seen:
                    seen.add(key)
                    alumni.append(person)
        return alumni[:8]

    def _unc_mentioned_in_proxy(self, cik: str) -> bool:
        """Return True if any recent DEF 14A for this CIK mentions UNC."""
        try:
            params = {
                'q': '"University of North Carolina"',
                'forms': 'DEF 14A',
                'dateRange': 'custom',
                'startdt': '2018-01-01',
                'enddt': date.today().isoformat(),
            }
            r = self._get(self.search_url, timeout=8, params=params)
            r.raise_for_status()
            hits = r.json().get('hits', {}).get('hits', []) or []
            for hit in hits:
                for c in ((hit.get('_source') or {}).get('ciks') or []):
                    try:
                        if str(c) == str(cik):
                            return True
                    except (ValueError, TypeError):
                        continue
            return False
        except Exception as e:
            logger.warning("UNC proxy pre-filter error: %s", e)
            return None  # None = unknown; caller treats as "proceed"

    def _resolve_proxy_doc_url(self, url: str) -> str:
        """If url is a filing directory, follow it to find the main .htm document."""
        if not url:
            return ''
        if not url.endswith('/'):
            return url  # already a direct document link
        try:
            assert_public_url(url)  # SSRF guard: only public http(s) hosts
            r = self._get(url, timeout=8)
            r.raise_for_status()
            assert_public_url(r.url)  # re-check after any redirect
            # Find .htm links; prefer ones with "proxy" or "def14a" in the name
            links = re.findall(r'href="([^"]*\.(?:htm|html))"', r.text, re.IGNORECASE)
            for link in links:
                low = link.lower()
                if 'proxy' in low or 'def14a' in low or 'def 14a' in low:
                    return url.rstrip('/') + '/' + link.lstrip('/')
            if links:
                return url.rstrip('/') + '/' + links[0].lstrip('/')
        except Exception as e:
            logger.warning("Proxy index resolve error (%s): %s", url, e)
        return ''

    def _fetch_proxy_bytes(self, url: str, max_bytes: int = 800_000) -> str:
        """Fetch a proxy document, capped at max_bytes, returned as str."""
        try:
            assert_public_url(url)  # SSRF guard: only public http(s) hosts
            r = self._get(
                url, timeout=14, stream=True,
            )
            r.raise_for_status()
            assert_public_url(r.url)  # re-check after any redirect
            chunks, size = [], 0
            for chunk in r.iter_content(chunk_size=16_384):
                chunks.append(chunk)
                size += len(chunk)
                if size >= max_bytes:
                    break
            return b''.join(chunks).decode('utf-8', errors='ignore')
        except Exception as e:
            logger.warning("DEF 14A fetch error (%s): %s", url, e)
            return ''

    def get_unc_alumni_from_website(self, company_name: str,
                                    website_url: str = '') -> list:
        """Scrape a company's leadership page and return UNC-educated people.

        Works best for companies with server-rendered HTML bio pages (many NC
        corporate sites still do this).  JavaScript-heavy SPAs will return an
        empty shell — we fail gracefully with an empty list.
        """
        name_key = company_name.lower().strip()
        # Start with the hardcoded known URL, then try the SEC-provided website
        # base, then fall back to common leadership path patterns.
        candidates: list[str] = []
        if name_key in _KNOWN_LEADERSHIP_URLS:
            candidates.append(_KNOWN_LEADERSHIP_URLS[name_key])
        if website_url:
            base = website_url.rstrip('/')
            for path in _LEADERSHIP_PATHS:
                url = base + path
                if url not in candidates:
                    candidates.append(url)

        alumni: list = []
        seen: set = set()
        for url in candidates[:5]:  # try at most 5 URLs to stay within budget
            try:
                # SSRF guard: the company website is external/SEC-provided, and
                # requests follows redirects — block any private/metadata host.
                assert_public_url(url)
                r = self._get(
                    url,
                    headers={'User-Agent': USER_AGENT,
                             'Accept': 'text/html,application/xhtml+xml'},
                    timeout=10,
                    stream=True,
                )
                assert_public_url(r.url)  # re-check after any redirect
                if r.status_code not in (200, 203):
                    continue
                # Cap at 300 KB — leadership pages are short; large payloads
                # are usually JS bundles that won't parse usefully.
                chunks, size = [], 0
                for chunk in r.iter_content(chunk_size=8_192):
                    chunks.append(chunk)
                    size += len(chunk)
                    if size >= 300_000:
                        break
                raw = b''.join(chunks).decode('utf-8', errors='ignore')
                # Heuristic: if the page has almost no visible text it's
                # JS-rendered — skip rather than waste parse time.
                text_estimate = len(re.sub(r'<[^>]+>', '', raw))
                if text_estimate < 500:
                    continue
                for person in _parse_proxy_for_unc(raw, url):
                    key = person['name'].lower().strip()
                    if key and key not in seen:
                        seen.add(key)
                        alumni.append(person)
                if alumni:
                    break  # found people — no need to try other URLs
            except Exception as e:
                logger.warning("Website alumni fetch error (%s): %s", url, e)
                continue
        return alumni[:8]

    def _find_cik(self, company_name: str) -> Optional[str]:
        """Resolve a company name → CIK using SEC's official ticker map first,
        then fall back to full-text search."""
        q = (company_name or "").lower().strip()
        nq = _norm_name(company_name)
        nq_tokens = nq.split()
        nq_set = set(nq_tokens)
        nq_sig = [w for w in nq_tokens if w not in _CORP_SUFFIX_TOKENS]
        tickers = load_tickers()
        # Score each ticker. On ties, prefer the title with the FEWEST extra
        # descriptive tokens (tokens that are neither in the query nor a corporate
        # suffix), then the shorter title. So "Goldman Sachs" → "Goldman Sachs
        # Group Inc" (extras: none) over "Goldman Sachs BDC Inc" (extra: "bdc"),
        # and "Coca-Cola" → "Coca-Cola Co" over the longer Europacific bottler.
        best = None
        best_key = (0, 1, 0)  # (score, -extra, -len): higher is better
        for t in tickers:
            sym = (t.get("ticker") or "").lower()
            nt = _norm_name(t.get("title") or "")
            if not nt:
                continue
            nt_tokens = nt.split()
            nt_set = set(nt_tokens)
            score = 0
            if nq == sym or q == sym:
                score = 100
            elif nq == nt:
                score = 95
            # title == query + exactly one trailing corporate suffix
            elif (len(nt_tokens) == len(nq_tokens) + 1
                  and nt_tokens[:len(nq_tokens)] == nq_tokens
                  and nt_tokens[-1] in _CORP_SUFFIXES):
                score = 90
            elif nt.startswith(nq + " "):
                score = 80
            # every discriminating query token is a whole word in the title
            elif nq_sig and all(w in nt_set for w in nq_sig):
                score = 60
            if score > 0:
                extra = sum(1 for w in nt_tokens
                            if w not in nq_set and w not in _CORP_SUFFIX_TOKENS)
                key = (score, -extra, -len(nt))
                if key > best_key:
                    best_key = key
                    best = t
        best_score = best_key[0]
        # Require a whole-word or exact match (>= 60). A bare substring is not
        # sufficient (it mis-resolved "Pendo" → "oPENDOor"); and a single shared
        # token is not sufficient (it mis-resolved "Atrium Health" → "Atrium
        # Therapeutics") — ALL discriminating tokens must be present.
        if best and best_score >= 60:
            return str(best["cik_str"])

        # Fallback to full-text search, but only trust a hit whose resolved
        # company title actually shares a word with the query — otherwise the
        # top hit is just some filer that *mentions* the name (e.g. a 10-K
        # naming "OpenAI"), which would attribute the wrong company's data.
        try:
            active = _active_cik_titles()
            # Significant query tokens: drop generic corporate/sector words so a
            # single shared common word ("games", "energy") can never satisfy a
            # match. A full-text hit is trusted only when the resolved title
            # contains ALL of the query's discriminating tokens (or matches it
            # exactly / by prefix) — otherwise the hit is just a filer that
            # *mentions* the name and would attribute the wrong company's data.
            sig_tokens = {w for w in nq_tokens if w not in _CORP_SUFFIX_TOKENS}
            r = self._get(self.search_url,
                                  params={"q": company_name}, timeout=6)
            r.raise_for_status()
            hits = r.json().get("hits", {}).get("hits", []) or []
            for hit in hits:
                ciks = (hit.get("_source", {}) or {}).get("ciks", []) or []
                for c in ciks:
                    try:
                        ci = int(c)
                    except (ValueError, TypeError):
                        continue
                    nt = _norm_name(active.get(ci) or "")
                    if not nt:
                        continue
                    title_tokens = set(nt.split())
                    if (nq == nt or nt.startswith(nq + " ")
                            or (sig_tokens and sig_tokens.issubset(title_tokens))):
                        return str(ci)
            return None
        except Exception as e:
            logger.warning("SEC search error: %s", e)
            return None


# ── Company website leadership page URLs ─────────────────────────────────────
# Known-good direct URLs for leadership / about pages, especially for private
# NC companies that have no SEC proxy statements.  Falls back to common path
# patterns when the company isn't listed here.
_KNOWN_LEADERSHIP_URLS: dict = {
    'sas institute':   'https://www.sas.com/en_us/company-information/management.html',
    'red hat':         'https://www.redhat.com/en/about/leadership',
    'epic games':      'https://www.epicgames.com/site/en-US/about',
    'lenovo':          'https://www.lenovo.com/us/en/about/management-team/',
    'bandwidth':       'https://www.bandwidth.com/about/leadership/',
    'pendo':           'https://www.pendo.io/about/',
    'truist financial':'https://ir.truist.com/governance/board-of-directors',
    'first citizens bancshares': 'https://ir.firstcitizens.com/corporate-governance/board-of-directors',
    'labcorp':         'https://ir.labcorp.com/governance/board-of-directors',
    'iqvia holdings':  'https://ir.iqvia.com/governance/board-of-directors',
    'duke energy':     'https://www.duke-energy.com/our-company/about-us/leadership',
    'nucor corporation': 'https://www.nucor.com/leadership/',
}

# Common leadership path suffixes to try when no hardcoded URL is available.
_LEADERSHIP_PATHS = [
    '/leadership',
    '/about/leadership',
    '/about/management',
    '/about/executive-team',
    '/about/team',
    '/company/leadership',
    '/en/about/leadership',
    '/investor-relations/governance/board-of-directors',
    '/about',
]

# ── DEF 14A proxy-statement UNC alumni parsing ──────────────────────────────

_UNC_RE = re.compile(
    r'University\s+of\s+North\s+Carolina(?:\s+at\s+Chapel\s+Hill)?'
    r'|UNC[\s\-]?Chapel\s+Hill'
    r'|UNC\s+School\s+of\s+(?:Medicine|Law|Business|Pharmacy|Nursing|Dentistry)'
    r'|Kenan[\s\-]Flagler(?:\s+Business\s+School)?'
    r'|Gillings\s+School(?:\s+of\s+Global\s+Public\s+Health)?'
    r'|UNC\s+Eshelman\s+School\s+of\s+Pharmacy'
    r'|UNC\s+Lineberger',
    re.IGNORECASE,
)

_EDU_CTX_RE = re.compile(
    r'\b(?:received?|earned?|graduated?|attended?|'
    r'degree\s+(?:from|in|at)|'
    r'B\.?[AS]\.?|M\.?B\.?A\.?|M\.?[SA]\.?|J\.?D\.?|Ph\.?D\.?|M\.?D\.?|'
    r'bachelor|master|doctoral|law\s+degree|medical\s+school|'
    r'undergraduate|graduate\s+degree|postgraduate|studied|majored)\b',
    re.IGNORECASE,
)

_DEGREE_RE = [
    (re.compile(r'\b(?:Ph\.?D\.?|Doctor(?:al|ate)|Sc\.?D\.?)\b', re.I), 'PhD'),
    (re.compile(r'\b(?:M\.?D\.?|Doctor\s+of\s+Medicine|Medical\s+degree)\b', re.I), 'MD'),
    (re.compile(r'\b(?:J\.?D\.?|Doctor\s+of\s+Jurisprudence|Law\s+degree)\b', re.I), 'JD'),
    (re.compile(r'\b(?:M\.?B\.?A\.?|Master\s+of\s+Business)\b', re.I), 'MBA'),
    (re.compile(r'\b(?:M\.?S\.?|M\.?A\.?|M\.?Eng\.?|Master(?:\'?s)?)\b', re.I), "Master's"),
    (re.compile(r"\b(?:B\.?S\.?|B\.?A\.?|A\.?B\.?|Bachelor(?:'?s)?)\b", re.I), "Bachelor's"),
]

_TITLE_RE = [
    (re.compile(r'Chief\s+Executive\s+Officer|\bCEO\b', re.I), 'Chief Executive Officer'),
    (re.compile(r'President\s+(?:and|&)\s+Chief\s+Executive', re.I), 'President & CEO'),
    (re.compile(r'Chief\s+Financial\s+Officer|\bCFO\b', re.I), 'Chief Financial Officer'),
    (re.compile(r'Chief\s+Operating\s+Officer|\bCOO\b', re.I), 'Chief Operating Officer'),
    (re.compile(r'Chief\s+Technology\s+Officer|\bCTO\b', re.I), 'Chief Technology Officer'),
    (re.compile(r'Chief\s+Medical\s+Officer|\bCMO\b', re.I), 'Chief Medical Officer'),
    (re.compile(r'Chief\s+Scientific\s+Officer|\bCSO\b', re.I), 'Chief Scientific Officer'),
    (re.compile(r'Chief\s+Legal\s+Officer|General\s+Counsel', re.I), 'General Counsel'),
    (re.compile(r'Chief\s+Commercial\s+Officer', re.I), 'Chief Commercial Officer'),
    (re.compile(r'\bPresident\b(?!\s+of\s+the\s+(?:United|Board))', re.I), 'President'),
    (re.compile(r'Executive\s+Vice\s+President', re.I), 'Executive Vice President'),
    (re.compile(r'Senior\s+Vice\s+President', re.I), 'Senior Vice President'),
    (re.compile(r'Vice\s+President', re.I), 'Vice President'),
    (re.compile(r'Chair(?:man|woman|person)?\s+of\s+the\s+Board|Board\s+Chair', re.I), 'Board Chair'),
    (re.compile(r'Lead\s+Independent\s+Director', re.I), 'Lead Independent Director'),
    (re.compile(r'Independent\s+Director', re.I), 'Independent Director'),
    (re.compile(r'\bDirector\b', re.I), 'Director'),
]

# Words that appear in ALL CAPS in proxy docs but are NOT names
_PROXY_SKIP = {
    'CEO', 'CFO', 'COO', 'CTO', 'CMO', 'CSO', 'CLO', 'PHD', 'MBA', 'JD',
    'UNC', 'SEC', 'EDGAR', 'ANNUAL', 'REPORT', 'PROXY', 'STATEMENT',
    'BOARD', 'DIRECTORS', 'DIRECTOR', 'COMMITTEE', 'NASDAQ', 'NYSE',
    'CORP', 'INC', 'LLC', 'LLP', 'USA', 'US', 'AGE', 'CLASS', 'NOMINEE',
    'OFFICER', 'THE', 'AND', 'FOR', 'OR', 'OF', 'IN', 'AT', 'TO', 'BY',
    'UNIVERSITY', 'COLLEGE', 'SCHOOL', 'INSTITUTE', 'CORPORATION',
}


def _strip_proxy_html(text: str) -> str:
    """Strip HTML while preserving paragraph structure via newlines.

    Large-company proxy statements (Microsoft, Alphabet) wrap each bio field
    in table cells.  If we collapse all tags to spaces the name cell and bio
    cell become one undifferentiated blob and the name extractor can no longer
    find the relationship between a person's name and their UNC mention.
    Converting block-level elements to newlines keeps those boundaries intact.
    """
    text = re.sub(r'<script[^>]*?>.*?</script>', ' ', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*?>.*?</style>', ' ', text, flags=re.DOTALL | re.IGNORECASE)
    # Block elements → newline so paragraph structure survives
    text = re.sub(
        r'</?(?:p|div|tr|li|h[1-6]|section|article|header|footer)[^>]*?>',
        '\n', text, flags=re.IGNORECASE,
    )
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    # Remaining tags → single space
    text = re.sub(r'<[^>]+>', ' ', text)
    text = _html.unescape(text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r' \n|\n ', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _proxy_unc_degree(context: str) -> str:
    for pat, label in _DEGREE_RE:
        if pat.search(context):
            return label
    return ''


def _proxy_find_name_title(lines_before: list) -> tuple:
    """Search backwards through lines preceding a UNC mention for a name + title.

    Large-company proxy statements put the name, age, and bio in separate table
    rows/cells.  After HTML stripping those become separate lines.  Searching
    the 25 lines immediately before the UNC mention reliably finds the
    executive whose bio contains that educational reference.
    """
    name = title = ''
    for line in reversed(lines_before[-25:]):
        line = line.strip()
        if not line or len(line) < 3:
            continue

        if not name:
            # "John Smith, age 52"  or  "John Smith (52)"
            m = re.search(
                r'\b([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'
                r'(?:,?\s+(?:age\s+)?\d{2}\b|\s+\(\d{2}\))',
                line,
            )
            if m:
                name = m.group(1).strip()

        if not name:
            # ALL-CAPS  "JOHN L. HENNESSY"  "SUNDAR PICHAI"
            for m in re.finditer(
                r'\b([A-Z]{2,}(?:\s+(?:[A-Z]\.?\s+)?[A-Z]{2,})+)\b', line
            ):
                candidate = m.group(1).strip()
                words = [w.rstrip('.') for w in candidate.split()]
                if (len(words) >= 2
                        and not all(w in _PROXY_SKIP for w in words)
                        and not re.search(
                            r'\b(?:UNIVERSITY|SCHOOL|COLLEGE|INSTITUTE|'
                            r'CORPORATION|COMMITTEE|NASDAQ|NYSE|ANNUAL)\b',
                            candidate)):
                    name = candidate.title()
                    break

        if not name:
            # "Mr. John Smith"  "Dr. Jane Doe"
            m = re.search(
                r'\b(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s+'
                r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b',
                line,
            )
            if m:
                name = m.group(1).strip()

        if not title:
            for pat, label in _TITLE_RE:
                if pat.search(line):
                    title = label
                    break

        if name and title:
            break

    # Sanity-check: reject names that are actually title phrases
    if name and re.search(
        r'^(?:Chief|Vice|Executive|Senior|Independent|Lead|Board)', name
    ):
        name = ''

    return name, title


def _parse_proxy_for_unc(html_text: str, source_url: str) -> list:
    """Return [{name, title, unc_credential, source_url}] for UNC-educated execs.

    Works line-by-line after paragraph-preserving HTML stripping so that table-
    structured bios (Microsoft, Alphabet, etc.) are handled correctly.
    """
    text = _strip_proxy_html(html_text)
    lines = text.splitlines()
    results: list = []
    seen_line_idx: set = set()

    for i, line in enumerate(lines):
        if not _UNC_RE.search(line):
            continue
        # Require an educational keyword in the same line or one adjacent line
        ctx = '\n'.join(lines[max(0, i - 2): i + 3])
        if not _EDU_CTX_RE.search(ctx):
            continue
        # Deduplicate: skip if we already found someone from a nearby line
        if any(abs(i - prev) <= 4 for prev in seen_line_idx):
            continue
        seen_line_idx.add(i)

        name, title = _proxy_find_name_title(lines[:i])
        if not name or len(name.split()) < 2:
            continue

        degree = _proxy_unc_degree(ctx)
        credential = 'UNC Chapel Hill'
        if degree:
            credential += f' — {degree}'

        results.append({
            'name': name,
            'title': title or 'Executive / Director',
            'unc_credential': credential,
            'source_url': source_url,
        })
    return results


def _filing_url(cik: str, accession: str, doc: str) -> str:
    if not accession:
        return f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"
    acc_clean = accession.replace("-", "")
    if doc:
        return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_clean}/{doc}"
    return f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_clean}/"
