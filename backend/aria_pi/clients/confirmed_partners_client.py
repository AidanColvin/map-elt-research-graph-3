"""Confirmed-partner lookup — reads the manually-curated UNC interaction
registry (unc_confirmed_partners.json) and returns the matching record for
a given company name, or a typed empty record when no match exists.

This is a pure dict lookup — zero network calls, zero latency.
"""

import json
import os
import re

_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "unc_confirmed_partners.json"
)
_CACHE: dict | None = None

_PAREN_RE = re.compile(r"\s*\([^)]*\)")

EMPTY_CONFIRMED = {
    "found": False,
    "partner": "",
    "partner_type": "",
    "unc_unit": "",
    "engagement_type": "",
    "relationship_status": "",
    "best_evidence": "",
    "best_source_validity": "",
    "best_source_url": "",
    "best_snippet": "",
    "notes": "",
}


def _load() -> dict:
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            _CACHE = json.load(f)
    except FileNotFoundError:
        print(f"[confirmed_partners] data file not found at {_DATA_PATH}. "
              "Run scripts/export_confirmed_partners.py first.")
        _CACHE = {}
    except Exception as e:
        print(f"[confirmed_partners] failed to load data: {e}")
        _CACHE = {}
    return _CACHE


def _normalize(name: str) -> str:
    """Lowercase + strip parenthetical suffixes for a consistent lookup key."""
    s = _PAREN_RE.sub("", name or "")
    return s.strip().lower()


# takes: a company name (str) as entered by the user or resolved by the orchestrator
# does: normalises the name to a lookup key and checks it against the curated
#       confirmed-partners registry; tries the full name first, then the
#       parenthetical-stripped version, to match e.g. "Leidos Holdings, Inc."
#       against a key stored as "leidos"
# returns: the confirmed-partner record with "found": True, or EMPTY_CONFIRMED
def resolve_confirmed_partner(company_name: str) -> dict:
    db = _load()
    if not db:
        return EMPTY_CONFIRMED

    candidates = []

    # 1. Exact normalised key
    full_key = _normalize(company_name)
    candidates.append(full_key)

    # 2. Strip everything after " / " (slash-joined multi-orgs)
    if " / " in company_name:
        for part in company_name.split(" / "):
            candidates.append(_normalize(part))

    # 3. First word only (catches "Leidos" from "Leidos Holdings")
    first_word = full_key.split()[0] if full_key.split() else ""
    if first_word and len(first_word) > 3:
        candidates.append(first_word)

    for key in candidates:
        if key in db:
            return {**db[key], "found": True}

    return EMPTY_CONFIRMED
