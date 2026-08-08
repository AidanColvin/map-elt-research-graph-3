"""Redact personal research attribution from the tracked inventory data files.

Allowlist-based so this script never contains a personal name itself:
any researchBy value not owned by the repo owner or a system label is
replaced with the neutral team label.
"""

from pathlib import Path
import re
import sys

TEAM_LABEL = "Map research team"

ALLOWED_EXACT = {"", "Aidan Colvin", TEAM_LABEL}
ALLOWED_PREFIXES = ("Map ", "Inventory ")

TARGET_FILES = [
    "map/lib/inventory/partnershipRecords.ts",
    "map/lib/inventory/accountRecords.ts",
    "map/components/workspace/accountsData.ts",
]


def value_is_allowed(value: str) -> bool:
    """
    takes: a researchBy string value
    does: checks it against the exact allowlist and system-label prefixes
    gives: True if the value may stay in a public file, else False
    """
    return value in ALLOWED_EXACT or value.startswith(ALLOWED_PREFIXES)


def redact_value(value: str) -> str:
    """
    takes: a researchBy string value
    does: keeps allowed values, replaces anything else with the team label
    gives: the value safe for a public repository
    """
    return value if value_is_allowed(value) else TEAM_LABEL


def redact_text(text: str) -> tuple[str, int]:
    """
    takes: the full text of a TypeScript data file
    does: rewrites every researchBy field through redact_value
    gives: the redacted text and the count of values changed
    """
    changed = 0

    def replace(match: re.Match) -> str:
        nonlocal changed
        original = match.group(2)
        redacted = redact_value(original)
        if redacted != original:
            changed += 1
        return f"{match.group(1)}{redacted}{match.group(3)}"

    pattern = re.compile(r'("?researchBy"?\s*:\s*")([^"]*)(")')
    return pattern.sub(replace, text), changed


def redact_file(path: Path) -> int:
    """
    takes: a Path to a tracked data file
    does: redacts its researchBy fields in place when needed
    gives: the number of values that were changed
    """
    text = path.read_text(encoding="utf-8")
    redacted, changed = redact_text(text)
    if changed:
        path.write_text(redacted, encoding="utf-8")
    return changed


def main() -> int:
    """
    takes: nothing (operates on the repo-relative TARGET_FILES)
    does: redacts every target file and prints a per-file change count
    gives: process exit code 0 on success, 1 if a target file is missing
    """
    repo_root = Path(__file__).resolve().parent.parent
    status = 0
    for rel in TARGET_FILES:
        path = repo_root / rel
        if not path.exists():
            print(f"MISSING {rel}", file=sys.stderr)
            status = 1
            continue
        changed = redact_file(path)
        print(f"{rel}: {changed} value(s) redacted")
    return status


if __name__ == "__main__":
    sys.exit(main())
