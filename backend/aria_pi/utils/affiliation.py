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
    "meta": ["Meta Platforms", "Facebook", "Meta AI", "Meta, Menlo Park"],
    "alphabet": ["Google", "DeepMind", "Verily", "Alphabet"],
    "google": ["Google", "DeepMind", "Verily"],
    "amazon web services": ["Amazon Web Services", "Amazon.com"],
    "aws": ["Amazon Web Services", "Amazon.com"],
    "apple": ["Apple Inc", "Apple, Inc", "Apple Computer"],
    "snowflake": ["Snowflake Computing", "Snowflake Inc"],
    "bandwidth": ["Bandwidth Inc", "Bandwidth.com"],
    "ibm": ["IBM", "International Business Machines"],
    "sas": ["SAS Institute"],
    # Common-word company names. Each bare token below matches ordinary prose —
    # "visa" (immigration), "block"/"Block Center" (surname, buildings),
    # "affirm" (verb), "target"/"gap"/"shell"/"square"/"ally"/"discover"
    # (everyday words), "amazon" (the region), "oracle" (Delphi, model names),
    # "green dot" (a literal green dot in vision studies) — so they surfaced
    # fake UNC ties (a "Visa" NIH grant about student visas; a "Block" paper in
    # Nature via an author's Block-named center). Their queries and affiliation
    # checks must use corporate phrases only; _AMBIGUOUS_TOKENS below stops the
    # bare token from re-entering as a fallback.
    "block": ["Block, Inc", "Block Inc", "Square, Inc", "Square Inc"],
    "square": ["Square, Inc", "Square Inc", "Block, Inc"],
    "visa": ["Visa Inc", "Visa, Inc", "Visa Research", "Visa International", "Visa U.S.A"],
    "ally": ["Ally Financial", "Ally Bank"],
    "ally financial": ["Ally Financial", "Ally Bank"],
    "amazon": ["Amazon.com", "Amazon Web Services", "Amazon, Inc", "Amazon Inc"],
    "target": ["Target Corporation", "Target Corp"],
    "shell": ["Shell plc", "Royal Dutch Shell", "Shell Oil", "Shell Global Solutions"],
    "stripe": ["Stripe, Inc", "Stripe Inc"],
    "discover": ["Discover Financial"],
    "discover financial": ["Discover Financial"],
    "gap": ["Gap Inc", "Gap, Inc"],
    "affirm": ["Affirm Holdings", "Affirm, Inc", "Affirm Inc"],
    "affirm holdings": ["Affirm Holdings", "Affirm, Inc", "Affirm Inc"],
    "oracle": ["Oracle Corporation", "Oracle Corp", "Oracle Health", "Oracle Cerner", "Oracle Labs"],
    "green dot": ["Green Dot Corporation", "Green Dot Corp", "Green Dot Bank"],
    # Science-vocabulary collisions: "Tesla" is the magnetic-field unit in every
    # MRI grant, "stem" is stem cells / STEM education, "micron" is µm,
    # "arm" is a robotic arm or a trial arm, "unity" and "compass" are ordinary
    # nouns, "chewy" describes food texture.
    "tesla": ["Tesla, Inc", "Tesla Inc", "Tesla Motors", "Tesla Energy"],
    "stem": ["Stem, Inc", "Stem Inc"],
    "unity": ["Unity Software", "Unity Technologies"],
    "unity software": ["Unity Software", "Unity Technologies"],
    "micron": ["Micron Technology"],
    "arm": ["Arm Holdings", "ARM Limited", "Arm Ltd"],
    "arm holdings": ["Arm Holdings", "ARM Limited", "Arm Ltd"],
    "compass": ["Compass, Inc", "Compass Inc", "Compass Real Estate"],
    "chewy": ["Chewy, Inc", "Chewy Inc"],
    # Common-bigram company names: quoted-phrase search is punctuation-blind,
    # so "Pattern Energy" matches "...activity pattern, energy expenditure..."
    # in an aging-institute abstract, and "First Solar" matches "the first
    # solar-powered...". Anchor them to their full corporate names.
    "pattern energy": ["Pattern Energy Group"],
    "first solar": ["First Solar, Inc", "First Solar Inc"],
    # Ordinary-vocabulary collisions from the insurance sector: "progressive"
    # is a stock adjective in medical abstracts ("progressive multiple
    # sclerosis", "progressive hearing loss") and "travelers" names any
    # traveler-health study ("returning travelers", "travelers' diarrhea") —
    # both matched NIH grant text and PubMed affiliations with zero connection
    # to the insurers.
    "progressive": ["Progressive Corporation", "Progressive Corp", "The Progressive Corporation"],
    "travelers": ["Travelers Companies", "The Travelers Companies", "Travelers Indemnity",
                  "Travelers Insurance"],
    # "Mosaic" (the fertilizer company, ticker MOS) collides with "mosaic" /
    # "mosaicism" — a standard genetics term (chromosomal mosaicism, genetic
    # mosaic) — so neuroscience/developmental NIH grants about mosaicism
    # attributed themselves to the fertilizer company.
    "mosaic": ["Mosaic Company", "The Mosaic Company"],
    # "RTX" is Resiniferatoxin, a capsaicin-analog compound named by its
    # abbreviation "RTX" throughout pain/neuroscience literature — a defense
    # contractor's ticker colliding with a pharmacology reagent.
    "rtx": ["RTX Corporation", "RTX Corp", "Raytheon Technologies", "Raytheon Company"],
    # "Moog" (the aerospace actuator maker, NYSE: MOG.A) is also a common
    # German/Dutch surname that turned up as an unrelated paper author.
    "moog": ["Moog Inc", "Moog, Inc"],
}

# Normalized keys whose BARE name must never be used as a query phrase or an
# affiliation match — only their corporate aliases above identify the company.
# (Distinctive coined names — Pfizer, Nvidia, Zscaler — stay matchable bare.)
_AMBIGUOUS_TOKENS = {
    "meta", "apple", "sas", "aws", "block", "square", "visa", "ally",
    "amazon", "target", "shell", "stripe", "discover", "gap", "affirm",
    "oracle", "green dot", "tesla", "stem", "unity", "micron", "arm",
    "compass", "chewy", "pattern energy", "first solar", "progressive",
    "travelers", "mosaic", "rtx", "moog",
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
def is_ambiguous_company(name: str) -> bool:
    """True when the bare name is a common word/phrase, not a safe token to
    match on its own — the shared check behind every ambiguous-name guard
    (PubMed/NIH affiliation matching here, ClinicalTrials.gov sponsor matching
    in clinicaltrials_client.py)."""
    key = _norm(name)
    core = re.sub(r"\s+", " ", _CORP_SUFFIX_RE.sub(" ", key)).strip()
    return key in _AMBIGUOUS_TOKENS or core in _AMBIGUOUS_TOKENS


def company_affiliation_regex(name: str):
    phrases = company_aliases(name)
    base = re.sub(r"\s+", " ", _PARENS_RE.sub(" ", name or "")).strip()
    # The bare name is a usable fallback ONLY when it isn't a common word: for
    # ambiguous names (Block, Visa, Target…) the corporate aliases are the
    # whole identity, and re-adding the bare token here would reopen the exact
    # false-positive hole the alias table closes.
    ambiguous = is_ambiguous_company(name)
    if base and not ambiguous and base.lower() not in {p.lower() for p in phrases}:
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
