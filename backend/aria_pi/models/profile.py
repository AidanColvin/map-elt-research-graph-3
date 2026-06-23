from pydantic import BaseModel
from typing import Any, List, Dict, Optional
from aria_pi.models.claim import Claim

class CompanyProfile(BaseModel):
    company_name: str
    # SEC facts hold mixed types — bools (is_public), lists (tickers), and
    # nested dicts (xbrl) — so values are typed Any rather than coerced to str.
    facts: Dict[str, Any]
    pipeline: List[Claim]
    partnering_history: List[Claim]
    unc_alignment: List[Claim]
    what_unc_offers: List[Claim]
