from aria_pi.models.profile import CompanyProfile
from typing import List, Dict

# Generic marketing language that is never an acceptable substitute for a
# sourced, specific fact. Matched case-insensitively as substrings.
BANNED_PHRASES = ("strong research capacity", "world-class", "leading institution")


class VerificationStage:
    def __init__(self, banned_phrases=BANNED_PHRASES):
        """
        Takes: optional banned-phrase overrides (defaults to BANNED_PHRASES).
        Does: Initializes the verification rules engine.
        Returns: Nothing.
        """
        self.banned_phrases = tuple(banned_phrases)

    def run(self, profiles: List[CompanyProfile]) -> Dict:
        """
        Takes: A list of populated CompanyProfile objects.
        Does: Runs soft and hard verification checks across all generated claims.
        Returns: A dict with structured soft_flags / hard_stops and an overall
                 status of PASSED, WARNING (soft flags only), or BLOCKED (a hard
                 stop fired).
        """
        log: Dict = {"hard_stops": [], "soft_flags": [], "status": "PASSED"}

        for profile in profiles:
            for claim in profile.pipeline + profile.partnering_history + profile.unc_alignment:
                if not claim.is_verified:
                    log["soft_flags"].append({
                        "company": profile.company_name,
                        "type": "unverified_claim",
                        "detail": claim.text,
                        "reason": claim.unverified_reason or "Fewer than two reputable sources.",
                    })

                # Generic marketing language is a soft flag, never a hard stop.
                lowered = claim.text.lower()
                hit = next((p for p in self.banned_phrases if p in lowered), None)
                if hit:
                    log["soft_flags"].append({
                        "company": profile.company_name,
                        "type": "banned_phrase",
                        "detail": f'Banned marketing phrase "{hit}" in claim.',
                    })

            # Hard stop: a company we present as a SEC filer must carry its core
            # registration fact. A company that is explicitly private (is_public
            # is False) legitimately has no SEC data, so it is NOT blocked — it
            # is a soft flag at most.
            facts = profile.facts or {}
            if not facts.get("legal_name"):
                if facts.get("is_public") is False:
                    log["soft_flags"].append({
                        "company": profile.company_name,
                        "type": "private_no_sec",
                        "detail": "Private company — no SEC legal_name on file.",
                    })
                else:
                    log["hard_stops"].append({
                        "company": profile.company_name,
                        "type": "missing_sec_fact",
                        "detail": "Missing critical SEC fact data (legal_name).",
                    })

        if log["hard_stops"]:
            log["status"] = "BLOCKED"
        elif log["soft_flags"]:
            log["status"] = "WARNING"
        return log
