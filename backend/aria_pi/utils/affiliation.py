"""Affiliation matching — shared by the PubMed and OpenAlex co-authorship
clients so "a company author and a UNC author are on the same paper" means the
exact same thing everywhere.

Two accuracy problems this solves:

1. **Naming the UNC author.** A paper found via
   ``"University of North Carolina"[Affiliation]`` only proves *some* author is
   at UNC — not *which* one. The previous code tallied every co-author as a
   "UNC Research Contact", so a paper's Johns Hopkins or Stanford first author
   was shown as a UNC person. :func:`is_unc_affiliation` lets the clients name
   the actual UNC author(s) by matching each author's own affiliation, while
   excluding the sibling NC campuses (Charlotte, Greensboro, …) and NC State.

2. **Company false positives.** A bare company token matches unrelated
   affiliations. ``"Meta"[Affiliation]`` hits "Meta-Research Innovation Center"
   and "metabolic"; ``"SAS"`` / ``"AWS"`` hit acronyms that are not the company.
   :func:`company_affiliation_regex` anchors ambiguous names to their real
   corporate affiliation strings (Meta → "Meta Platforms"/"Facebook") and
   requires a whole-word, non-hyphenated match for short tokens, so
   "meta-analysis" no longer counts as Meta Platforms.
"""
import re

# The other UNC-system campuses (and NC State) — if any of these appear in an
# affiliation that also says "University of North Carolina", it is NOT Chapel
# Hill and must not be attributed to UNC Chapel Hill.
_NON_CHAPEL_HILL = (
    "charlotte", "greensboro", "wilmington", "asheville", "pembroke",
    "north carolina central", "north carolina a&t", "north carolina state",
)

# Named UNC Chapel Hill schools/centers whose appearance alone proves UNC-CH.
_UNC_CENTERS = (
    "gillings", "lineberger", "eshelman", "sheps center",
    "carolina health informatics", "unc health", "unc-chapel hill",
    "unc chapel hill",
)


# takes: a single author's affiliation string
# does: decides whether it is UNC Chapel Hill specifically (not another NC
#       campus or NC State)
# returns: True if the affiliation is UNC Chapel Hill
def is_unc_affiliation(affiliation: str) -> bool:
    if not affiliation:
        return False
    a = affiliation.lower()
    if "chapel hill" in a:
        return True
    if any(c in a for c in _UNC_CENTERS):
        return True
    if "university of north carolina" in a:
        # The flagship is conventionally written "University of North Carolina"
        # (optionally "...at Chapel Hill"). Reject only when a sibling campus is
        # named explicitly.
        return not any(c in a for c in _NON_CHAPEL_HILL)
    return False


# Affiliation aliases for companies whose bare name collides with a common word
# or whose corporate identity differs from the query string. Keyed by the
# normalized company name (lowercased, parentheticals and corporate suffixes
# stripped). Values are matched case-insensitively as substrings against author
# affiliations and used verbatim to build PubMed/OpenAlex queries.
_COMPANY_ALIASES = {
    "meta": ["Meta Platforms", "Facebook"],
    "alphabet": ["Google", "DeepMind", "Verily", "Alphabet"],
    "google": ["Google", "DeepMind", "Verily"],
    "amazon web services": ["Amazon Web Services", "Amazon.com"],
    "aws": ["Amazon Web Services", "Amazon.com"],
    "apple": ["Apple Inc", "Apple, Inc", "Apple Computer"],
    "snowflake": ["Snowflake Computing", "Snowflake Inc"],
    "bandwidth": ["Bandwidth Inc", "Bandwidth.com"],
    "ibm": ["IBM", "International Business Machines"],
    "sas": ["SAS Institute"],
}

_PARENS_RE = re.compile(r"\(.*?\)")
_NONALNUM_RE = re.compile(r"[^a-z0-9 ]+")
_CORP_SUFFIX_RE = re.compile(
    r"\b(inc|incorporated|corp|corporation|co|company|llc|llp|ltd|plc|gmbh|ag|"
    r"nv|sa|technologies|technology|platforms|systems|holdings|labs|"
    r"laboratories|pharmaceuticals|pharma|group)\b"
)


# takes: a company name (possibly with a parenthetical or corporate suffix)
# does: lowercases and strips parentheticals + punctuation to a comparison key
# returns: the normalized key
def _norm(name: str) -> str:
    n = _PARENS_RE.sub(" ", name or "")
    n = _NONALNUM_RE.sub(" ", n.lower())
    return re.sub(r"\s+", " ", n).strip()


# takes: a company name or ticker query
# does: returns the affiliation phrases that identify the company — its known
#       corporate aliases when the bare name is ambiguous, otherwise the
#       de-parenthesized name itself
# returns: a list of affiliation phrases (original case preserved where possible)
def company_aliases(name: str) -> list:
    key = _norm(name)
    if key in _COMPANY_ALIASES:
        return list(_COMPANY_ALIASES[key])
    core = re.sub(r"\s+", " ", _CORP_SUFFIX_RE.sub(" ", key)).strip()
    if core in _COMPANY_ALIASES:
        return list(_COMPANY_ALIASES[core])
    base = re.sub(r"\s+", " ", _PARENS_RE.sub(" ", name or "")).strip()
    return [base] if base else []


# takes: a company name and a PubMed search field (Affiliation or Title/Abstract)
# does: builds an OR-clause over the company's identifying phrases for that field
# returns: a parenthesized PubMed query clause, e.g.
#          ("Meta Platforms"[Affiliation] OR "Facebook"[Affiliation])
def company_query_clause(name: str, field: str = "Affiliation") -> str:
    phrases = [p.strip() for p in company_aliases(name) if p.strip()]
    if not phrases:
        phrases = [(name or "").strip() or "UNKNOWN"]
    return "(" + " OR ".join(f'"{p}"[{field}]' for p in phrases) + ")"


# takes: a company name
# does: compiles a regex that an author affiliation must match to count as the
#       company. Multiword / distinctive aliases match as substrings; a short
#       single-word token must match as a whole word NOT glued to more letters
#       or a hyphen, so "Meta Platforms" counts but "meta-analysis",
#       "metabolic", and "Meta-Research" do not.
# returns: a compiled regex, or None if no usable token exists
def company_affiliation_regex(name: str):
    phrases = company_aliases(name)
    base = re.sub(r"\s+", " ", _PARENS_RE.sub(" ", name or "")).strip()
    if base and base.lower() not in {p.lower() for p in phrases}:
        phrases.append(base)

    pats = []
    for a in phrases:
        a = a.strip().lower()
        if not a:
            continue
        esc = re.escape(a)
        if " " in a:
            pats.append(esc)                          # multiword phrase: specific as substring
        else:
            # Single token (Pfizer, Oracle, Meta, IBM…): require a whole word not
            # glued to more letters or a hyphen, so "Pfizer-Granada" (an
            # eponymous academic center), "meta-analysis", and "metabolic" do
            # NOT count, while "Pfizer Inc"/"Meta, Menlo Park" do.
            pats.append(r"\b" + esc + r"(?![\w-])")
    if not pats:
        return None
    return re.compile("|".join(pats), re.I)
