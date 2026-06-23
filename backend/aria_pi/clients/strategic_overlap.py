"""Strategic Overlap detector — 10-K Item 1A Risk Factors vs UNC research titles.

The resolver already fetches a company's latest 10-K narrative but never isolates
the risk-factors section. This module pulls Item 1A out of that text and matches
its language against the UNC research TITLES we already hold (paper, grant, and
trial titles — NOT abstracts, which we do not store). A "Strategic Overlap"
signal surfaces ONLY on a real lexical match: a shared multi word phrase, or two
or more specific shared terms. A weak or absent match produces nothing, so the
signal can never be fabricated.

Every payload returned is validated by the StrategicOverlap Pydantic model before
it reaches the resolver and the frontend.
"""
import re
from typing import List, Optional

from pydantic import BaseModel, field_validator


# ── Tunable constants (named, not magic numbers) ────────────────────────────

# Item 1A can run long; cap the slice we scan so a malformed end-marker never
# lets the section swallow the rest of the filing.
MAX_ITEM_1A_CHARS = 200_000

# A single shared word only counts as "specific" once it is at least this long,
# biasing the term path toward domain vocabulary over short generic words.
MIN_SPECIFIC_TERM_LEN = 5

# Tokens in a candidate two word phrase must each clear this length, so a phrase
# match cannot be carried by a throwaway token.
MIN_PHRASE_TOKEN_LEN = 4

# The term path requires at least this many distinct specific shared terms.
MIN_SHARED_TERMS = 2

# Length of the risk-factor excerpt surfaced as evidence.
MAX_RISK_EXCERPT_CHARS = 240

# Grammatical and generic-business vocabulary that must never anchor an overlap.
# A 10-K risk section and almost any title trivially share these, so counting
# them would manufacture overlaps that do not exist.
_STOPWORDS = {
    # grammatical
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "our", "its", "their", "his", "her", "them", "they", "have", "has", "had",
    "will", "would", "could", "may", "might", "can", "into", "than", "then",
    "such", "which", "who", "whom", "whose", "what", "when", "where", "while",
    "any", "all", "not", "but", "also", "any", "each", "other", "more", "most",
    "some", "these", "those", "out", "via", "per", "upon", "between", "among",
    "under", "over", "about", "above", "below", "after", "before", "during",
    # generic business / 10-K boilerplate
    "company", "companies", "business", "businesses", "financial", "results",
    "operations", "operating", "market", "markets", "marketing", "product",
    "products", "service", "services", "customer", "customers", "revenue",
    "revenues", "growth", "costs", "cost", "expenses", "material", "materially",
    "adverse", "adversely", "affect", "affected", "risk", "risks", "factors",
    "condition", "conditions", "future", "including", "related", "certain",
    "significant", "ability", "based", "addition", "result", "increase",
    "decrease", "change", "changes", "develop", "development", "industry",
    "global", "international", "national", "year", "years", "period", "current",
    "new", "high", "low", "large", "small", "number", "level", "rate", "value",
    "use", "used", "using", "make", "made", "including", "various", "many",
    "well", "due", "additional", "potential", "general", "common", "third",
    "party", "parties", "time", "times", "subject", "require", "required",
    "provide", "provided", "across", "within", "through", "regulatory",
    "regulation", "regulations", "government", "governmental", "legal", "laws",
    "act", "compliance", "operational", "strategic", "competition",
    "competitive", "competitors", "stock", "shares", "shareholders",
    "investors", "investment", "investments", "capital", "cash", "credit",
    "income", "tax", "taxes", "data", "system", "systems", "technology",
    "technologies", "information", "management", "employees", "personnel",
    "supply", "demand", "price", "prices", "pricing", "economic", "economy",
    # clinical / scientific boilerplate — shared by almost any 10-K risk section
    # and any research title, so counting them would manufacture overlaps
    "patient", "patients", "trial", "trials", "phase", "study", "studies",
    "outcome", "outcomes", "positive", "negative", "factor", "treatment",
    "treatments", "response", "responses", "effect", "effects", "analysis",
    "analyses", "evaluation", "randomized", "controlled", "disease", "diseases",
    "report", "reported", "people", "major", "events", "novel", "advanced",
    "associated", "association", "qualitative", "interviews", "exploratory",
    "research", "approach", "approaches", "model", "models", "method", "methods",
    "human", "adult", "adults", "pediatric", "population", "cohort", "sample",
    "functional", "molecular", "cellular", "genetic", "clinical",
    "efficacy", "safety", "generation", "generations", "commercial",
    "commercialization", "approval", "approvals", "approved", "reimbursement",
    "coverage", "mechanism", "mechanisms", "agent", "agents", "active",
    "inactive", "dose", "dosing", "dosage", "indication", "indications",
    "candidate", "candidates", "pipeline", "portfolio", "label", "labeling",
    "marketed", "launch", "commercially", "available", "successful", "success",
    "evaluate", "evaluating", "primary", "secondary", "endpoint", "endpoints",
    "combination", "monotherapy", "first", "second", "third", "single",
    "following", "impact", "impacts", "individual", "individuals", "cross",
    "prior", "acquisition", "acquisitions", "acquired", "recent", "recently",
    "ongoing", "expected", "anticipated", "estimate", "estimated", "believe",
    "continue", "continued", "remain", "remains", "given", "however",
    "therefore", "comparison", "evaluation", "assessment", "characterization",
}


class StrategicOverlap(BaseModel):
    """A validated overlap between 10-K risk language and a UNC research title.

    Surfaced only on a real match. `matched_phrase` is set on the stronger two
    word path; `matched_terms` carries the specific shared single terms.
    """

    matched_title: str
    source_type: str  # "paper" | "grant" | "trial"
    matched_phrase: Optional[str] = None
    matched_terms: List[str] = []
    risk_excerpt: str
    filing_url: str = ""

    @field_validator("matched_title", "risk_excerpt")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        """Reject blank title/excerpt so a hollow overlap can never validate."""
        if not v or not v.strip():
            raise ValueError("must be non-empty")
        return v

    @field_validator("source_type")
    @classmethod
    def _known_source(cls, v: str) -> str:
        """Constrain the source label to the three real title origins."""
        if v not in ("paper", "grant", "trial"):
            raise ValueError("source_type must be paper, grant, or trial")
        return v


# takes: the plain-text narrative of a 10-K filing
# does: isolates the Item 1A Risk Factors section, preferring the real body over
#       the table-of-contents entry and ending at Item 1B or Item 2
# returns: the risk-factors text, or "" when no section is found
def extract_item_1a(tenk_text: str) -> str:
    """Return the Item 1A Risk Factors body from a 10-K's plain text."""
    if not tenk_text:
        return ""
    # All "Item 1A" headers (optionally "Risk Factors"); the first is usually
    # the table-of-contents pointer, so prefer the last occurrence as the body.
    starts = list(re.finditer(r"item\s*1a[.:\s]+(?:risk\s+factors)?",
                              tenk_text, flags=re.IGNORECASE))
    if not starts:
        return ""
    start = starts[-1].end()
    tail = tenk_text[start:start + MAX_ITEM_1A_CHARS]
    # End at the next section marker — Item 1B (Unresolved Staff Comments) or,
    # when that is absent, Item 2 (Properties).
    end_match = re.search(r"item\s*1b[.:\s]", tail, flags=re.IGNORECASE) \
        or re.search(r"item\s*2[.:\s]", tail, flags=re.IGNORECASE)
    body = tail[:end_match.start()] if end_match else tail
    return body.strip()


# takes: any text fragment
# does: lowercases and splits it into alphabetic word tokens
# returns: the token list in order
def _tokens(text: str) -> List[str]:
    """Split text into lowercased alphabetic tokens."""
    return re.findall(r"[a-z]+", (text or "").lower())


# takes: an ordered token list
# does: keeps tokens that are specific (long enough and not stopwords)
# returns: the set of specific terms
def _specific_terms(tokens: List[str]) -> set:
    """Return the set of specific single terms from a token list."""
    return {t for t in tokens
            if len(t) >= MIN_SPECIFIC_TERM_LEN and t not in _STOPWORDS}


# takes: an ordered token list
# does: builds adjacent two word phrases where BOTH tokens are non-stopword and
#       long enough, so a phrase is carried by real vocabulary on both sides
# returns: the set of "word word" phrase strings
def _phrases(tokens: List[str]) -> set:
    """Return the set of significant adjacent two word phrases."""
    out = set()
    for a, b in zip(tokens, tokens[1:]):
        if (a not in _STOPWORDS and b not in _STOPWORDS
                and len(a) >= MIN_PHRASE_TOKEN_LEN
                and len(b) >= MIN_PHRASE_TOKEN_LEN):
            out.add(f"{a} {b}")
    return out


# takes: the Item 1A token list and a phrase or term to locate
# does: finds the first sentence-like window of risk text containing the anchor
# returns: a trimmed excerpt, or "" when the anchor is absent
def _excerpt_for(item_1a: str, anchor: str) -> str:
    """Return a short risk-factor excerpt containing the matched anchor."""
    if not anchor:
        return ""
    flat = re.sub(r"\s+", " ", item_1a).strip()
    idx = flat.lower().find(anchor.lower())
    if idx < 0:
        return ""
    half = MAX_RISK_EXCERPT_CHARS // 2
    lo = max(0, idx - half)
    hi = min(len(flat), idx + len(anchor) + half)
    snippet = flat[lo:hi].strip()
    prefix = "…" if lo > 0 else ""
    suffix = "…" if hi < len(flat) else ""
    return f"{prefix}{snippet}{suffix}"


# takes: a company's 10-K text, the UNC research titles (tagged by source), and
#        the 10-K filing URL
# does: extracts Item 1A and scores each title for a real lexical overlap — a
#       shared two word phrase (strong) or two-plus specific shared terms; never
#       fabricates a match
# returns: the single best validated StrategicOverlap as a dict, or None
def find_strategic_overlap(
    tenk_text: str,
    titles: List[dict],
    filing_url: str = "",
) -> Optional[dict]:
    """Return the best validated overlap dict between Item 1A and titles, or None.

    `titles` is a list of { title, source_type } where source_type is one of
    "paper", "grant", or "trial".
    """
    item_1a = extract_item_1a(tenk_text)
    if not item_1a or not titles:
        return None

    risk_tokens = _tokens(item_1a)
    risk_terms = _specific_terms(risk_tokens)
    risk_phrases = _phrases(risk_tokens)
    if not risk_terms and not risk_phrases:
        return None

    best = None  # (rank_tuple, StrategicOverlap)
    for entry in titles:
        title = (entry.get("title") or "").strip()
        source_type = entry.get("source_type") or ""
        if not title or source_type not in ("paper", "grant", "trial"):
            continue
        title_tokens = _tokens(title)
        shared_phrases = sorted(_phrases(title_tokens) & risk_phrases)
        # Rank shared terms by distinctiveness (longer first) so the headline and
        # excerpt anchor lead with the most specific shared vocabulary.
        shared_terms = sorted(_specific_terms(title_tokens) & risk_terms,
                              key=lambda t: (-len(t), t))

        # A phrase match is the strong path; otherwise require two-plus terms.
        if shared_phrases:
            anchor = shared_phrases[0]
            matched_phrase = anchor
        elif len(shared_terms) >= MIN_SHARED_TERMS:
            anchor = shared_terms[0]
            matched_phrase = None
        else:
            continue

        excerpt = _excerpt_for(item_1a, anchor)
        if not excerpt:
            continue
        try:
            overlap = StrategicOverlap(
                matched_title=title,
                source_type=source_type,
                matched_phrase=matched_phrase,
                matched_terms=shared_terms,
                risk_excerpt=excerpt,
                filing_url=filing_url,
            )
        except ValueError:
            continue
        # Rank: phrase matches first, then more shared terms, then longer title.
        rank = (1 if matched_phrase else 0, len(shared_terms), len(title))
        if best is None or rank > best[0]:
            best = (rank, overlap)

    return best[1].model_dump() if best else None
