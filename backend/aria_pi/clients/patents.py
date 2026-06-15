"""USPTO PatentsView client — free federal patent data.

Adds the IP dimension to company profiles: patent volume, recency, and the
top CPC technology categories.

Endpoint reality (probed 2026-06): the keyless legacy endpoints
(api.patentsview.org/patents/query, search.rpatentsview.org) are retired or
unresolvable; the current Search API (search.patentsview.org/api/v1/patent/)
requires a free API key sent as X-Api-Key. This client uses the keyed API
when PATENTSVIEW_API_KEY is set and still tries the legacy endpoints as a
fallback, returning safe zero-defaults whenever nothing is reachable — a
missing key can never break a report.
"""
import json
import os
import urllib.parse
from collections import Counter
from datetime import date
from typing import List

import requests

# Same User-Agent + timeout pattern as the SEC EDGAR client.
USER_AGENT = "InnovateCarolina research.intelligence@unc.edu"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}
TIMEOUT = 8

SEARCH_API = "https://search.patentsview.org/api/v1/patent/"
LEGACY_ENDPOINTS = [
    "https://search.rpatentsview.org/patents/query",
    "https://api.patentsview.org/patents/query",
]

# Legal-entity suffixes dropped to build the short-name query variant.
_NAME_SUFFIXES = (" inc", " inc.", " corp", " corp.", " corporation",
                  " ltd", " ltd.", " llc", " plc", " co", " co.",
                  " company", " holdings", " group", " sa", " ag", " nv")

EMPTY = {
    "patent_count": 0,
    "recent_patent_count": 0,
    "top_categories": [],
    "patents_url": "",
}


def _name_variants(company_name: str) -> List[str]:
    """Full name first, then the suffix-stripped short name if different."""
    full = (company_name or "").strip()
    if not full:
        return []
    short = full.lower()
    for suf in _NAME_SUFFIXES:
        if short.endswith(suf):
            short = short[: -len(suf)].strip()
            break
    variants = [full]
    if short and short != full.lower():
        variants.append(short.title())
    return variants


def _summarize(patents: List[dict]) -> dict:
    """Counts, 3-year recency, and top-3 CPC titles from raw patent rows."""
    cutoff = date(date.today().year - 3, date.today().month, 1).isoformat()
    recent = sum(1 for p in patents if (p.get("patent_date") or "") >= cutoff)
    cats: Counter = Counter()
    for p in patents:
        groups = p.get("cpc_current") or p.get("cpcs") or []
        for g in groups if isinstance(groups, list) else []:
            title = (g.get("cpc_group_title") or g.get("cpc_group_id") or "").strip()
            if title:
                cats[title] += 1
    return {
        "patent_count": len(patents),
        "recent_patent_count": recent,
        "top_categories": [t for t, _ in cats.most_common(3)],
    }


def _query_search_api(name: str, api_key: str) -> List[dict]:
    """Current keyed Search API; raises on transport errors (caller catches)."""
    q = {"_text_phrase": {"assignees.assignee_organization": name}}
    f = ["patent_id", "patent_date",
         "cpc_current.cpc_group_id", "cpc_current.cpc_group_title"]
    params = {"q": json.dumps(q), "f": json.dumps(f),
              "o": json.dumps({"size": 100})}
    headers = dict(HEADERS)
    headers["X-Api-Key"] = api_key
    r = requests.get(SEARCH_API, headers=headers, params=params, timeout=TIMEOUT)
    if r.status_code == 400:
        # CPC sub-fields can 400 on schema drift — retry without them.
        params["f"] = json.dumps(["patent_id", "patent_date"])
        r = requests.get(SEARCH_API, headers=headers, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return (r.json() or {}).get("patents") or []


def _query_legacy(name: str, endpoint: str) -> List[dict]:
    """Retired keyless endpoints, kept as a best-effort fallback."""
    body = {
        "q": {"_text_phrase": {"assignee_organization": name}},
        "f": ["patent_id", "patent_date", "cpc_group_id", "cpc_group_title"],
        "o": {"per_page": 100},
    }
    r = requests.post(endpoint, headers=HEADERS, json=body, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json() if "json" in (r.headers.get("Content-Type") or "") else {}
    return (data or {}).get("patents") or []


def fetch_unc_patents(company_name: str, max_results: int = 5) -> List[dict]:
    """UNC-assigned patents that may overlap with the company's sector.

    Searches PatentsView for patents assigned to UNC Chapel Hill whose title
    contains keywords from the company name. Returns UNCPatent-shaped dicts
    with title, patent_id, date, school. Returns [] when no API key is set or
    the search returns nothing.
    """
    api_key = os.environ.get("PATENTSVIEW_API_KEY", "").strip()
    if not api_key:
        return []
    unc_assignees = [
        "University of North Carolina at Chapel Hill",
        "University of North Carolina Chapel Hill",
        "University of North Carolina",
    ]
    results: List[dict] = []
    for assignee in unc_assignees:
        if results:
            break
        try:
            q = {
                "_and": [
                    {"_text_phrase": {"assignees.assignee_organization": assignee}},
                    {"_text_any": {"patent_title": company_name}},
                ]
            }
            f = ["patent_id", "patent_title", "patent_date", "assignees.assignee_organization"]
            params = {"q": json.dumps(q), "f": json.dumps(f),
                      "o": json.dumps({"size": max_results})}
            headers = dict(HEADERS)
            headers["X-Api-Key"] = api_key
            r = requests.get(SEARCH_API, headers=headers, params=params, timeout=TIMEOUT)
            r.raise_for_status()
            patents = (r.json() or {}).get("patents") or []
            for p in patents:
                org = ""
                assignees_list = p.get("assignees") or []
                if assignees_list and isinstance(assignees_list, list):
                    org = (assignees_list[0].get("assignee_organization") or "")
                results.append({
                    "patent_id": p.get("patent_id") or "",
                    "title": p.get("patent_title") or "",
                    "date": p.get("patent_date") or "",
                    "school": org or assignee,
                })
        except Exception as e:
            print(f"UNC PatentsView error ({assignee}): {e}")
    return results


def fetch_patents(company_name: str) -> dict:
    """IP portfolio summary for a company. Never raises.

    Tries the full legal name, then the short name, keeping whichever
    variant returns more patents (PatentsView assignee matching is fuzzy).
    """
    try:
        api_key = os.environ.get("PATENTSVIEW_API_KEY", "").strip()
        best: List[dict] = []
        for name in _name_variants(company_name):
            patents: List[dict] = []
            if api_key:
                try:
                    patents = _query_search_api(name, api_key)
                except Exception as e:
                    print(f"PatentsView search API error ({name}): {e}")
            if not patents:
                for ep in LEGACY_ENDPOINTS:
                    try:
                        patents = _query_legacy(name, ep)
                        if patents:
                            break
                    except Exception:
                        continue  # retired endpoints fail routinely
            # Keep whichever name variant matched more patents.
            if len(patents) > len(best):
                best = patents
        if not best:
            return dict(EMPTY)
        out = _summarize(best)
        out["patents_url"] = ("https://search.patentsview.org/?q="
                              + urllib.parse.quote_plus(company_name))
        return out
    except Exception as e:
        print(f"PatentsView error for {company_name}: {e}")
        return dict(EMPTY)
