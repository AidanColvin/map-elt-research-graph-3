"""Source validation for ARIA-PI claims.

A claim is only "verified" when it is backed by at least TWO distinct,
reputable, independently-checkable sources. Three rules enforce that, in order:

  1. Well-formedness — a source must be an ``http(s)`` URL with a host. Bare
     strings like ``"sec.gov"`` or ``"javascript:…"`` never count.
  2. Reputability — the host must be a primary/official source: any ``.gov`` or
     ``.edu`` host, one of the recognized research/economic-development orgs in
     :data:`REPUTABLE_ORGS`, or (when supplied) the subject company's own
     website. Anything else — and anything on the aggregator/user-editable
     :data:`BLOCKLIST` — is discarded. The blocklist always wins.
  3. Distinctness — the SAME url listed twice is ONE source. This is what stops
     a claim being "double-sourced" by padding the list with a duplicate
     (e.g. ``["https://www.sec.gov", "https://www.sec.gov"]``).
"""
from urllib.parse import urlparse

from aria_pi.models.claim import Claim

# Aggregator / user-editable / low-trust hosts that must NEVER count as a
# reputable source, even when they would otherwise pass the allowlist.
BLOCKLIST = (
    "wikipedia.org", "crunchbase.com", "zoominfo.com",
    "linkedin.com", "glassdoor.com", "indeed.com",
)

# Recognized non-.gov/.edu organizations whose sites are primary sources for
# this product's domain (NC economic-development bodies, federal research
# partners, named UNC centers, and curated company sites). Matched on the
# registrable domain so subdomains are covered. Extend this list whenever the
# report builder starts citing a new official source host.
REPUTABLE_ORGS = (
    "ncbiotech.org", "edpnc.com", "charlotteregion.com", "unclineberger.org",
    "ncahec.net", "ncmep.org", "ncmilitary.org", "manufacturingusa.com",
    "rti.org", "rtp.org", "unchealth.org", "sas.com",
)


class SourceTagger:
    def __init__(self, blocklist=BLOCKLIST, reputable_orgs=REPUTABLE_ORGS):
        """
        Takes: optional blocklist / reputable-org overrides (defaults to the
               module constants).
        Does: initializes the validation rules engine.
        Returns: nothing.
        """
        self.blocklist = tuple(blocklist)
        self.reputable_orgs = tuple(reputable_orgs)

    @staticmethod
    def _normalize(url: str):
        """Takes a candidate source string. Returns ``(host, canonical_url)`` for
        a well-formed http(s) URL, or ``None`` if it is not a usable URL.

        ``host`` is lowercased and port-stripped; ``canonical_url`` lowercases
        the host and drops a trailing slash so two spellings of the same page
        dedupe cleanly."""
        try:
            p = urlparse((url or "").strip())
        except (ValueError, AttributeError):
            return None
        if p.scheme not in ("http", "https"):
            return None
        host = (p.hostname or "").lower()
        if not host:
            return None
        path = p.path.rstrip("/")
        canonical = f"{p.scheme}://{host}{path}"
        if p.query:
            canonical += f"?{p.query}"
        return host, canonical

    def _host_matches(self, host: str, domains) -> bool:
        """True if host equals, or is a subdomain of, any domain in ``domains``."""
        return any(host == d or host.endswith("." + d) for d in domains)

    def _is_reputable(self, host: str, company_domains) -> bool:
        # Blocklist always wins, regardless of TLD.
        if self._host_matches(host, self.blocklist):
            return False
        if host.endswith(".gov") or host.endswith(".edu"):
            return True
        if self._host_matches(host, self.reputable_orgs):
            return True
        if company_domains and self._host_matches(host, company_domains):
            return True
        return False

    def validate_claim(self, claim_text: str, available_sources: list,
                       company_domains: tuple = ()) -> tuple[bool, list]:
        """
        Takes: the claim string, a list of candidate source URLs, and an optional
               tuple of the subject company's own domains (counted as reputable).
        Does: keeps only well-formed, reputable, non-blocklisted sources and
              deduplicates them so the same URL can't be counted twice.
        Returns: ``(is_valid, clean_sources)`` where ``is_valid`` is True only
                 when at least two DISTINCT reputable sources remain.
        """
        company_domains = tuple(company_domains or ())
        clean: list = []
        seen: set = set()
        for src in available_sources or []:
            norm = self._normalize(src)
            if not norm:
                continue
            host, canonical = norm
            if not self._is_reputable(host, company_domains):
                continue
            if canonical in seen:
                continue  # same source listed twice is not two sources
            seen.add(canonical)
            clean.append(src)

        is_valid = len(clean) >= 2
        return is_valid, clean

    def tag_or_flag(self, claim_text: str, available_sources: list, stage: str,
                    company_domains: tuple = ()) -> Claim:
        """
        Takes: the claim string, candidate source URLs, the pipeline stage name,
               and optional company domains.
        Does: builds a Claim, flagging it inline when verification fails so the
              marker is visible everywhere the text is rendered.
        Returns: a structured Claim object.
        """
        is_valid, matched_sources = self.validate_claim(
            claim_text, available_sources, company_domains)

        reason = None
        if not is_valid:
            claim_text = f"{claim_text} [UNVERIFIED — ANALYST REVIEW REQUIRED]"
            reason = (f"Only {len(matched_sources)} distinct reputable source(s) "
                      f"found (2 required).")

        return Claim(
            text=claim_text,
            sources=matched_sources,
            is_verified=is_valid,
            stage=stage,
            unverified_reason=reason,
        )
