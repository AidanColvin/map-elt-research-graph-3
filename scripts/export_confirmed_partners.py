#!/usr/bin/env python3
"""
Convert the PARTNER COPY.xlsx "confirmed partners" sheet to the JSON lookup
the backend uses.

Usage:
  1. Export "confirmed partners" from the spreadsheet as CSV (File > Export > CSV).
  2. Run:  python scripts/export_confirmed_partners.py confirmed_partners.csv

Output:  backend/aria_pi/data/unc_confirmed_partners.json
"""

import csv
import json
import os
import re
import sys

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__),
    "..", "backend", "aria_pi", "data", "unc_confirmed_partners.json"
)

# Strips parenthetical acronyms and slash-joined sub-names so a lookup against
# "Air Force Research Laboratory" still hits the full stored name.
_PAREN_RE = re.compile(r"\s*\([^)]*\)")


def normalize(name: str) -> str:
    """Return a lowercase, stripped lookup key from a raw partner name."""
    s = _PAREN_RE.sub("", name)
    s = s.strip().lower()
    return s


def make_aliases(raw_name: str) -> list:
    """
    Generate all meaningful lookup keys for a partner name.

    E.g. "Air Force Research Laboratory (AFRL) / National Security
    Innovation Network (NSIN)" produces:
      - "air force research laboratory (afrl) / national security innovation network (nsin)"
      - "air force research laboratory"
      - "afrl"
      - "national security innovation network"
      - "nsin"
    """
    keys = set()
    keys.add(raw_name.strip().lower())

    # Strip parens variant
    no_parens = _PAREN_RE.sub("", raw_name).strip().lower()
    if no_parens:
        keys.add(no_parens)

    # Extract acronyms from parens
    for acronym in re.findall(r"\(([^)]+)\)", raw_name):
        keys.add(acronym.strip().lower())

    # Handle slash-joined multi-org names
    for part in raw_name.split("/"):
        part_clean = _PAREN_RE.sub("", part).strip().lower()
        if part_clean:
            keys.add(part_clean)
        for acronym in re.findall(r"\(([^)]+)\)", part):
            keys.add(acronym.strip().lower())

    return [k for k in keys if k]


def build_record(row: dict) -> dict:
    return {
        "partner":              row.get("Partner", "").strip(),
        "partner_type":         row.get("Partner_type", "").strip(),
        "unc_unit":             row.get("UNC_unit", "").strip(),
        "engagement_type":      row.get("Engagement_type", "").strip(),
        "relationship_status":  row.get("Partner-Level Relationship Status", "").strip(),
        "best_evidence":        row.get("Best Relationship Evidence", "").strip(),
        "best_source_validity": row.get("Best Source Validity", "").strip(),
        "best_source_url":      row.get("Best Source URL", "").strip(),
        "best_snippet":         row.get("Best Evidence Snippet", "").strip(),
        "notes":                row.get("Notes", "").strip(),
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/export_confirmed_partners.py <path/to/confirmed_partners.csv>")
        sys.exit(1)

    csv_path = sys.argv[1]
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        sys.exit(1)

    lookup: dict = {}
    skipped = 0

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_name = (row.get("Partner") or "").strip()
            if not raw_name:
                skipped += 1
                continue
            record = build_record(row)
            for alias in make_aliases(raw_name):
                if alias not in lookup:
                    lookup[alias] = record
                # If alias already exists, keep the stronger-evidence record
                elif record.get("best_evidence", "").lower().startswith("strong"):
                    lookup[alias] = record

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(lookup, f, indent=2, ensure_ascii=False)

    unique = len(set(json.dumps(v) for v in lookup.values()))
    print(f"Wrote {len(lookup)} lookup keys ({unique} unique partners, {skipped} rows skipped) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
