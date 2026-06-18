"""Company-name entity resolution.

The SEC EDGAR and unc.edu web searches need an exact legal company name —
a small typo ("Eli Lily") silently returns nothing. PubMed tolerates typos, so
only the strict clients need help. This module fuzzy-matches a user's query
against the official SEC company-title list and returns the canonical title
when confident, so the strict clients receive a name they can actually find.
"""

from rapidfuzz import process, fuzz, utils

from aria_pi.lib.tickers import load_tickers

_MATCH_THRESHOLD = 80          # rapidfuzz score (0-100) required to accept a match


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
    titles = [v.get("title", "") for v in load_tickers() if v.get("title")]
    if not titles:
        return q
    match = process.extractOne(
        q, titles, scorer=fuzz.WRatio, processor=utils.default_process
    )
    if match and match[1] >= _MATCH_THRESHOLD and _first_token_score(q, match[0]) >= _MATCH_THRESHOLD:
        return match[0]
    return q
