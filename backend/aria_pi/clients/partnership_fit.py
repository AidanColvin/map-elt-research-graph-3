"""Partnership Fit — the analysis layer the BD page was missing.

The rest of the resolver answers "is there a documented UNC tie, and where".
This module answers the questions a development officer actually asks next:

  * Which UNC school / center / lab is the RIGHT home for this company?
  * If a relationship already exists, what does it look like?
  * If it doesn't, what could it realistically look like (which vehicle)?
  * WHY is this a good UNC pairing?

It is deliberately deterministic and catalog-grounded — NOT generated prose — so
it can never invent a partnership. Recommendations are built from two grounded
inputs: (1) the company's domain (a curated map of well-known firms, falling
back to its SEC SIC industry), and (2) the UNIT THE COMPANY ALREADY CO-PUBLISHES
WITH (the observed `unc_units`), which is the strongest, evidence-based signal of
fit and is always ranked first. When UNC-Chapel Hill has no honest research
overlap with a company's core business, the fit says so plainly instead of
manufacturing one.
"""
import re
from typing import List

# ── UNC unit catalog ────────────────────────────────────────────────────────
# Real UNC-Chapel Hill schools/centers, each with the domains it fits, the
# realistic partnership vehicles for THAT unit, and a one-line statement of its
# distinctive strength. `match` maps an observed PubMed unit name back to a
# catalog entry so an existing co-authorship can be tied to its home.
UNC_UNITS = [
    {
        "key": "eshelman", "name": "UNC Eshelman School of Pharmacy",
        "url": "https://pharmacy.unc.edu",
        "tags": {"drug-discovery", "pharma", "devices", "chemistry", "biomedical"},
        "why": "a top-ranked pharmacy school strong in drug discovery, delivery, pharmacoengineering, and pharmacometrics",
        "forms": [
            "Sponsored Research Agreement on drug discovery, formulation, or delivery",
            "License UNC drug/formulation IP via the Office of Technology Commercialization",
            "Pharmacometrics / modeling & simulation collaboration",
        ],
        "match": re.compile(r"eshelman|pharmacy", re.I),
    },
    {
        "key": "lineberger", "name": "UNC Lineberger Comprehensive Cancer Center",
        "url": "https://unclineberger.org",
        "tags": {"oncology", "immunotherapy", "genomics", "clinical-trials", "biomedical"},
        "why": "an NCI-designated comprehensive cancer center with deep immunotherapy, cell-therapy, and cancer-data-science programs",
        "forms": [
            "Sponsor an investigator-initiated clinical trial",
            "Translational / biomarker research collaboration",
            "Cancer real-world-data partnership",
        ],
        "match": re.compile(r"lineberger|cancer center", re.I),
    },
    {
        "key": "gillings", "name": "UNC Gillings School of Global Public Health",
        "url": "https://sph.unc.edu",
        "tags": {"public-health", "biostatistics", "epidemiology", "environment",
                 "data", "nutrition", "health-it"},
        "why": "the top-ranked public public-health school, strong in epidemiology, biostatistics, real-world evidence, and environmental health",
        "forms": [
            "Real-world-evidence / epidemiology study",
            "Biostatistics & data-science research collaboration",
            "Population-health or environmental-exposure pilot",
        ],
        "match": re.compile(r"gillings|global public health|public health", re.I),
    },
    {
        "key": "tracs", "name": "NC TraCS Institute (UNC's NIH CTSA hub)",
        "url": "https://tracs.unc.edu",
        "tags": {"clinical-trials", "data", "health-it", "biomedical"},
        "why": "UNC's clinical & translational science hub, holding clinical-trial infrastructure, de-identified real-world health data, and biomedical informatics",
        "forms": [
            "Data Access Agreement for de-identified EHR / real-world data",
            "Clinical-trial site & patient recruitment",
            "Biomedical-informatics collaboration",
        ],
        "match": re.compile(r"tracs|translational", re.I),
    },
    {
        "key": "som", "name": "UNC School of Medicine",
        "url": "https://www.med.unc.edu",
        "tags": {"biomedical", "clinical-trials", "genetics", "genomics"},
        "why": "clinical and basic research across 30+ departments with UNC Health as the delivery system",
        "forms": [
            "Clinical research collaboration",
            "Sponsored Research Agreement with a clinical department",
        ],
        "match": re.compile(r"school of medicine|\bmedicine\b|genetics", re.I),
    },
    {
        "key": "cs", "name": "UNC Department of Computer Science",
        "url": "https://cs.unc.edu",
        "tags": {"computing", "ai", "graphics", "devices", "hci", "systems"},
        "why": "a CS department with marquee strengths in computer graphics, AR/VR, AI/ML, HCI, and high-performance systems",
        "forms": [
            "Sponsored research or gift in AI, graphics, or systems",
            "PhD fellowship & talent pipeline",
            "Joint lab or embedded-researcher program",
        ],
        "match": re.compile(r"computer science|\bcs\b", re.I),
    },
    {
        "key": "sdss", "name": "UNC School of Data Science and Society",
        "url": "https://datascience.unc.edu",
        "tags": {"data", "ai", "ml", "computing"},
        "why": "a university-wide data-science & AI school built to partner with industry across domains",
        "forms": [
            "Applied data-science / AI research collaboration",
            "Capstone projects & data-science talent pipeline",
        ],
        "match": re.compile(r"data science", re.I),
    },
    {
        "key": "sils", "name": "UNC School of Information & Library Science",
        "url": "https://sils.unc.edu",
        "tags": {"data", "health-it", "ai", "information"},
        "why": "a top iSchool focused on health informatics, human-AI interaction, and information retrieval",
        "forms": [
            "Health-informatics or human-AI-interaction collaboration",
            "MSIS / PhD talent pipeline",
        ],
        "match": re.compile(r"information.{0,6}library|\bsils\b|informatics", re.I),
    },
    {
        "key": "renci", "name": "RENCI (Renaissance Computing Institute)",
        "url": "https://renci.org",
        "tags": {"computing", "data", "hpc", "ai"},
        "why": "UNC's data-intensive computing institute, running HPC and large-scale data-infrastructure programs",
        "forms": [
            "Data-infrastructure / HPC research collaboration",
            "Cloud & large-scale data co-development",
        ],
        "match": re.compile(r"renci|renaissance computing", re.I),
    },
    {
        "key": "kenan", "name": "UNC Kenan-Flagler Business School",
        "url": "https://www.kenan-flagler.unc.edu",
        "tags": {"business", "fintech", "operations", "finance"},
        "why": "a top-ranked business school strong in strategy, operations, fintech, and entrepreneurship",
        "forms": [
            "Applied business research or center sponsorship",
            "MBA capstone & executive-education partnership",
        ],
        "match": re.compile(r"kenan|business school", re.I),
    },
    {
        "key": "bme", "name": "UNC/NC State Joint Dept. of Biomedical Engineering",
        "url": "https://bme.unc.edu",
        "tags": {"devices", "imaging", "biomedical", "hardware"},
        "why": "a joint BME department strong in medical devices, ultrasound, and imaging",
        "forms": [
            "Medical-device co-development / Sponsored Research Agreement",
            "License imaging or device IP",
            "Clinical validation study",
        ],
        "match": re.compile(r"biomedical engineering|\bbme\b", re.I),
    },
    {
        "key": "environ", "name": "UNC Institute for the Environment",
        "url": "https://ie.unc.edu",
        "tags": {"environment", "energy", "climate", "sustainability"},
        "why": "environmental, air-quality, and climate/sustainability research (UNC-CH's closest fit for energy & utilities)",
        "forms": [
            "Environmental, air-quality, or sustainability research",
            "Community-health / exposure study",
        ],
        "match": re.compile(r"institute for the environment|environment", re.I),
    },
]

_UNITS_BY_KEY = {u["key"]: u for u in UNC_UNITS}

# ── Company domain map ──────────────────────────────────────────────────────
# Curated tags for well-known firms (the displayed set + common health/other
# companies), so the fit doesn't depend on a SEC call for them. Keys are
# lowercased; matched by substring so "Amazon Web Services (AWS)" hits "amazon".
_COMPANY_DOMAINS = {
    # AI & cloud
    "microsoft": {"computing", "ai", "data", "health-it"},
    "google": {"computing", "ai", "data", "health-it"}, "alphabet": {"computing", "ai", "data"},
    "amazon": {"computing", "ai", "data", "health-it"}, "aws": {"computing", "ai", "data"},
    "nvidia": {"computing", "ai", "graphics", "devices"},
    "openai": {"computing", "ai", "ml"}, "anthropic": {"computing", "ai", "ml"},
    # enterprise software / data
    "salesforce": {"computing", "data", "ai", "business"},
    "oracle": {"computing", "data", "health-it", "business"},
    "sas": {"data", "ai", "biostatistics", "health-it"},
    "databricks": {"data", "ai", "ml", "computing"},
    "snowflake": {"data", "computing", "ai"},
    "palantir": {"data", "ai", "computing", "health-it"},
    # hardware & devices
    "apple": {"devices", "computing", "health-it"}, "lenovo": {"devices", "computing"},
    "cisco": {"computing", "systems", "data"}, "ibm": {"computing", "ai", "data"},
    "red hat": {"computing", "systems"}, "splunk": {"data", "computing", "systems"},
    # defense & energy & other
    "lockheed": {"computing", "data", "devices"}, "leidos": {"computing", "data", "health-it"},
    "duke energy": {"energy", "environment"}, "bandwidth": {"computing", "systems"},
    "epic games": {"computing", "graphics", "ai"}, "meta": {"computing", "ai", "graphics", "devices"},
    # life sciences / health
    "pfizer": {"drug-discovery", "clinical-trials", "oncology", "pharma"},
    "moderna": {"drug-discovery", "clinical-trials", "pharma", "genomics"},
    "merck": {"drug-discovery", "clinical-trials", "oncology", "pharma"},
    "lilly": {"drug-discovery", "clinical-trials", "pharma"},
    "genentech": {"drug-discovery", "oncology", "clinical-trials", "pharma"},
    "johnson": {"drug-discovery", "devices", "clinical-trials", "pharma"},
    "astrazeneca": {"drug-discovery", "oncology", "clinical-trials", "pharma"},
    "blue cross": {"public-health", "health-it", "data"},
}

# SEC SIC-description keyword → domain tags, for companies not in the curated map.
_SIC_TAGS = [
    (re.compile(r"pharmac|biolog|medicinal|drug", re.I), {"drug-discovery", "pharma", "clinical-trials"}),
    (re.compile(r"surgical|medical|dental|instrument|device", re.I), {"devices", "biomedical"}),
    (re.compile(r"semiconductor|computer|electronic", re.I), {"computing", "devices"}),
    (re.compile(r"software|prepackaged|programming|data processing|information", re.I), {"computing", "data", "ai"}),
    (re.compile(r"bank|financ|insurance|securit|credit", re.I), {"business", "fintech"}),
    (re.compile(r"electric|utilit|energy|petroleum|gas|power", re.I), {"energy", "environment"}),
    (re.compile(r"hospital|health serv|medical lab", re.I), {"health-it", "clinical-trials"}),
    (re.compile(r"telephone|communicat|telecom", re.I), {"computing", "systems"}),
]


# takes: a company name and optional SEC SIC description
# does: infers the company's BUSINESS domain tags from the curated map, falling
#       back to its SIC industry. (Observed co-authorship is handled separately
#       as evidence — folding it in here would let a unit inflate its own
#       overlap score against itself.)
# returns: a set of domain tags (possibly empty)
def infer_domain_tags(company_name: str, sic: str = "") -> set:
    tags: set = set()
    low = (company_name or "").lower()
    for key, t in _COMPANY_DOMAINS.items():
        if key in low:
            tags |= t
            break
    if not tags and sic:
        for rx, t in _SIC_TAGS:
            if rx.search(sic):
                tags |= t
    return tags


def _unit_for_observed(name: str):
    for u in UNC_UNITS:
        if u["match"].search(name or ""):
            return u
    return None


# takes: the company name, its SIC, and the verifiable signals already gathered
#        (observed unc_units, NIH grants, co-authored papers, UNC trials)
# does: ranks the best-fit UNC units — units the company ALREADY co-publishes
#       with first, then domain-matched units — and for each describes the
#       current state, the realistic partnership vehicle, and the rationale
# returns: a fit dict { headline, summary, has_documented_tie, best_units[],
#          caveat }
def build_fit(company_name: str, sic: str, unc_units: List[dict],
              nih_grants: List[dict], papers: List[dict], trials: List[dict]) -> dict:
    tags = infer_domain_tags(company_name, sic)

    # Papers-per-observed-unit, so "already co-publishing" can be quantified.
    observed = {}
    for u in unc_units or []:
        entry = _unit_for_observed(u.get("unit", ""))
        if entry:
            observed[entry["key"]] = observed.get(entry["key"], 0) + int(u.get("count", 0) or 0)

    scored = []
    for u in UNC_UNITS:
        overlap = len(u["tags"] & tags)
        evidence = observed.get(u["key"], 0)
        # Existing co-authorship is weighted heavily (a warm relationship), but
        # NOT so much that a single incidental paper buries the obvious strategic
        # fit — a strong domain match (e.g. NVIDIA ↔ Computer Science) can still
        # outrank a 1-paper tie, while a multi-paper tie stays on top.
        score = evidence * 4 + overlap * 2
        if score > 0:
            scored.append((score, evidence, u))
    scored.sort(key=lambda x: (-x[0], -x[1]))

    has_tie = bool(observed) or bool(nih_grants) or bool(trials)
    best_units = []
    for score, evidence, u in scored[:3]:
        documented = evidence > 0
        if documented:
            current = (f"Already co-publishing — {evidence} UNC paper"
                       f"{'s' if evidence != 1 else ''} attributed to this unit.")
        else:
            current = "No documented tie here yet — a clear opening."
        best_units.append({
            "key": u["key"], "name": u["name"], "url": u["url"],
            "why": f"{company_name} maps to {u['name']}, {u['why']}.",
            "current": current, "documented": documented,
            "evidence_papers": evidence, "forms": u["forms"],
        })

    if best_units:
        top = best_units[0]
        why_clause = _UNITS_BY_KEY[top["key"]]["why"]
        headline = f"Best UNC fit: {top['name']}"
        if top["documented"]:
            n = top["evidence_papers"]
            summary = (f"{company_name} and {top['name']} already share {n} co-authored "
                       f"paper{'s' if n != 1 else ''} — the natural place to formalize a "
                       f"partnership, since it is {why_clause}.")
        else:
            summary = (f"No documented UNC tie yet. The strongest potential pairing is "
                       f"{top['name']} — {why_clause} — because {company_name}'s work "
                       f"overlaps its strengths.")
        caveat = ""
    else:
        # Honest: UNC-Chapel Hill has no real research overlap with this business.
        headline = "Limited direct UNC research fit"
        summary = (f"UNC-Chapel Hill's research strengths are in health, the life "
                   f"sciences, data science, and computing; direct overlap with "
                   f"{company_name}'s core business is limited. The most realistic "
                   f"entry points are talent (recruiting UNC graduates), philanthropy, "
                   f"or a data/analytics collaboration via the School of Data Science.")
        caveat = ("No domain match in UNC's research portfolio — treat any pairing as "
                  "exploratory rather than research-driven.")
        best_units = [{
            "key": "sdss", "name": _UNITS_BY_KEY["sdss"]["name"], "url": _UNITS_BY_KEY["sdss"]["url"],
            "why": f"As a general entry point, {_UNITS_BY_KEY['sdss']['name']} partners across domains.",
            "current": "No documented tie.", "documented": False, "evidence_papers": 0,
            "forms": _UNITS_BY_KEY["sdss"]["forms"],
        }]

    return {
        "headline": headline,
        "summary": summary,
        "has_documented_tie": has_tie,
        "best_units": best_units,
        "caveat": caveat,
    }
