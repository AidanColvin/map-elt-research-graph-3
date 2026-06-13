"""Company-name entity resolution.

The SEC EDGAR and unc.edu web searches need an exact legal company name —
a small typo ("Eli Lily") silently returns nothing. PubMed tolerates typos, so
only the strict clients need help. This module fuzzy-matches a user's query
against the official SEC company-title list and returns the canonical title
when confident, so the strict clients receive a name they can actually find.
"""

import json
import os
import tempfile
import time

import requests
from rapidfuzz import process, fuzz, utils

_SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
# SEC requires a descriptive User-Agent on automated requests.
_HEADERS = {"User-Agent": "aria-pi research.intelligence@unc.edu"}
_MATCH_THRESHOLD = 80          # rapidfuzz score (0-100) required to accept a match
_CACHE_TTL_SECONDS = 86_400    # refresh the on-disk ticker cache daily
_TITLES_CACHE = {"titles": None}  # process-wide memo


# takes: nothing
# does: fetches the SEC company_tickers.json (memoized in-process and cached on
#       disk for a day) and returns the list of official company titles
# returns: a list of official SEC company title strings (empty on failure)
def _load_sec_titles() -> list:
    if _TITLES_CACHE["titles"] is not None:
        return _TITLES_CACHE["titles"]

    path = os.path.join(tempfile.gettempdir(), "sec_company_tickers.json")
    data = None
    try:
        if os.path.exists(path) and (time.time() - os.path.getmtime(path) < _CACHE_TTL_SECONDS):
            with open(path) as f:
                data = json.load(f)
    except Exception:
        data = None

    if data is None:
        try:
            r = requests.get(_SEC_TICKERS_URL, headers=_HEADERS, timeout=10)
            r.raise_for_status()
            data = r.json()
            try:
                with open(path, "w") as f:
                    json.dump(data, f)
            except Exception:
                pass  # disk cache is best-effort
        except Exception as e:
            print(f"SEC ticker fetch error: {e}")
            _TITLES_CACHE["titles"] = []
            return []

    titles = [v.get("title", "") for v in data.values() if v.get("title")]
    _TITLES_CACHE["titles"] = titles
    return titles


# takes: two strings
# does: compares only their leading significant token (companies are identified
#       by their distinctive first word, e.g. "Liquidia", "Eli")
# returns: a 0-100 similarity score for those first tokens
def _first_token_score(a: str, b: str) -> float:
    fa = (utils.default_process(a) or "").split()
    fb = (utils.default_process(b) or "").split()
    if not fa or not fb:
        return 0.0
    return fuzz.ratio(fa[0], fb[0])


# takes: a user's company query string
# does: fuzzy-matches it against the official SEC company titles; accepts the
#       best match only when it both scores >= 80% (WRatio) AND shares the
#       query's leading word — the second guard rejects confident-but-wrong hits
#       that merely share a trailing token like "Technologies" or "Corp"
#       (e.g. "Liquidia Technologies" -> "Westinghouse Air Brake Technologies")
# returns: the resolved official company title, or the original query
def normalize_company_name(query: str) -> str:
    q = (query or "").strip()
    if not q:
        return q
    titles = _load_sec_titles()
    if not titles:
        return q
    match = process.extractOne(
        q, titles, scorer=fuzz.WRatio, processor=utils.default_process
    )
    if match and match[1] >= _MATCH_THRESHOLD and _first_token_score(q, match[0]) >= _MATCH_THRESHOLD:
        return match[0]
    return q
