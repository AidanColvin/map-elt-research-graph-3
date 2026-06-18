"""NIH Reporter client — free public API, no key required.

Reporter is the public registry of NIH-funded research. Every grant has a
disclosed PI, organization, department, and dollar amount. If a UNC PI has
NIH funding related to a target company's research area — or if the
company appears in the grant text — that's a documented relationship
universities must disclose under conflict-of-interest policies.

Endpoint:
  POST https://api.reporter.nih.gov/v2/projects/search

Docs:
  https://api.reporter.nih.gov/
"""
import requests
from typing import List

ENDPOINT = "https://api.reporter.nih.gov/v2/projects/search"

_UNC_ORG_KEYWORDS = ("north carolina", "unc", "chapel hill")


def _coerce_award(value) -> int:
    """Cast an NIH award figure to int, or None when absent/unparseable."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def unc_pis_from_grants(grants: List[dict], limit: int = 3) -> List[dict]:
    """Named UNC contacts from grants already fetched — no new query.

    Filters the grants' PI/organization data (already extracted by
    unc_grants_mentioning) to UNC-affiliated orgs, dedupes by PI name, and
    returns up to `limit` contacts. Never raises — returns [] on bad input.
    """
    pis: List[dict] = []
    seen: set = set()
    try:
        for g in grants or []:
            name = (g.get("pi") or "").strip()
            org = (g.get("organization") or g.get("department") or "").strip()
            if not name or name.lower() in seen:
                continue
            if not any(kw in org.lower() for kw in _UNC_ORG_KEYWORDS):
                continue
            seen.add(name.lower())
            pis.append({
                "name": name,
                "org": org,
                "project_title": g.get("title") or "",
                "grant_url": g.get("url") or "https://reporter.nih.gov",
                # Enrichment for the report's faculty table / priority matrix —
                # the grant number and fiscal year, when the source carried them.
                "grant_num": g.get("project_num") or "",
                "fiscal_year": str(g.get("fiscal_year") or ""),
            })
            if len(pis) >= limit:
                break
    except Exception as e:
        print(f"UNC PI extraction error: {e}")
        return []
    return pis


class NIHReporterClient:
    def __init__(self):
        self.timeout = 8

    def unc_grants_mentioning(self, company_name: str, max_results: int = 5) -> List[dict]:
        """Search UNC-awarded NIH grants whose text mentions the company.

        Returns a list of dicts with PI, department, project number, agency,
        award year, fiscal year, and a stable reporter.nih.gov project URL.
        """
        payload = {
            "criteria": {
                "org_names": [
                    "UNIV OF NORTH CAROLINA CHAPEL HILL",
                ],
                "advanced_text_search": {
                    "operator": "and",
                    "search_field": "all",
                    "search_text": company_name,
                },
            },
            "include_fields": [
                "ProjectNum", "ProjectTitle", "ContactPiName", "PrincipalInvestigators",
                "Organization", "OrgName", "OrgDept", "FiscalYear", "AwardAmount",
                "AgencyIcAdmin", "ProjectStartDate", "ProjectEndDate",
            ],
            "offset": 0,
            "limit": max_results,
            "sort_field": "fiscal_year",
            "sort_order": "desc",
        }

        try:
            r = requests.post(ENDPOINT, json=payload, timeout=self.timeout)
            r.raise_for_status()
            results = (r.json() or {}).get("results", []) or []
        except Exception as e:
            print(f"NIH Reporter error for {company_name}: {e}")
            return []

        grants = []
        for g in results:
            proj_num = g.get("project_num") or g.get("ProjectNum") or ""
            pi_name = ""
            pis = g.get("principal_investigators") or g.get("PrincipalInvestigators") or []
            if pis and isinstance(pis, list):
                pi_name = pis[0].get("full_name") or pis[0].get("FullName") or ""
            if not pi_name:
                pi_name = g.get("contact_pi_name") or g.get("ContactPiName") or ""
            org = g.get("organization") or g.get("Organization") or {}
            dept = (org.get("org_dept") if isinstance(org, dict) else "") or ""
            org_name = (org.get("org_name") if isinstance(org, dict) else "") or g.get("OrgName", "")
            # Award dollars: the live API populates `award_amount` (total award);
            # `award_notice_amount` comes back null for UNC records, so it is only a
            # fallback. `direct_cost_amt` is the last resort. (Confirmed via live
            # smoke test against api.reporter.nih.gov.)
            award_amount = _coerce_award(
                g.get("award_amount") or g.get("AwardAmount")
                or g.get("award_notice_amount") or g.get("AwardNoticeAmount")
                or g.get("direct_cost_amt") or g.get("DirectCostAmt")
            )
            grants.append({
                "project_num": proj_num,
                "title": g.get("project_title") or g.get("ProjectTitle") or "",
                "pi": pi_name,
                "department": dept,
                "organization": org_name,
                "fiscal_year": g.get("fiscal_year") or g.get("FiscalYear") or "",
                "award_amount": award_amount,
                "agency": g.get("agency_ic_admin", {}).get("name", "") if isinstance(g.get("agency_ic_admin"), dict) else "",
                "url": f"https://reporter.nih.gov/project-details/{proj_num}" if proj_num else "https://reporter.nih.gov",
            })
        return grants


def fetch_unc_faculty_leads(company_name: str, max_results: int = 5) -> List[dict]:
    """UNCFacultyLead list from NIH grants mentioning the company at UNC.

    Maps the existing grant records to the UNCFacultyLead shape expected by
    the talking-points assembler: pi_name, pi_email, department, grant_number,
    project_title, fiscal_year, award_amount.
    """
    client = NIHReporterClient()
    grants = client.unc_grants_mentioning(company_name, max_results=max_results)
    leads = []
    for g in grants:
        leads.append({
            "pi_name": g.get("pi") or "",
            "pi_email": "",  # NIH Reporter does not expose PI email publicly
            "department": g.get("department") or "",
            "grant_number": g.get("project_num") or "",
            "project_title": g.get("title") or "",
            "fiscal_year": g.get("fiscal_year") or "",
            "award_amount": g.get("award_amount"),  # int or None, set in unc_grants_mentioning
        })
    return leads
