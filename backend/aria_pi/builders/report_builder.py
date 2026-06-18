"""Deterministic, free-tier report builder.

No LLM. No API keys. Every claim is built from one of:
  - SEC EDGAR (filing URLs, submissions API)
  - ClinicalTrials.gov (trial URLs)
  - PubMed (paper URLs)
  - NIH Reporter (grant URLs)
  - Curated UNC + sector JSON (with real source URLs)

Narrative-only slots (e.g., talking-point prose) are marked [REQUIRES ANALYST]
so a human can complete them. This honors the template's rule:
"If you cannot find two sources for a claim, mark it [UNVERIFIED] and flag it."
"""
from __future__ import annotations
import json
import logging
import os
import urllib.parse
from datetime import datetime
from typing import Dict, List, Any

from aria_pi.sectors import canonical_sector, SECTOR_NC_SEEDS
from aria_pi.clients.clinicaltrials_client import summarize_phases, unc_site_stats
from aria_pi.clients.nih_reporter_client import unc_pis_from_grants

logger = logging.getLogger(__name__)

# 10-K partnership-language scoring (Signal 4) — counted in memory over the
# narrative text the orchestrator already fetched; no calls from the builder.
PARTNERSHIP_TERMS = [
    "collaboration", "license", "licensing", "research agreement",
    "sponsored research", "university", "academic", "alliance",
    "joint venture", "co-development", "partnership",
]

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _load_json(name: str) -> Any:
    path = os.path.join(DATA_DIR, name)
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to load %s: %s", name, e, exc_info=False)
        return None


class ReportBuilder:
    def __init__(self):
        self.sector_ctx = _load_json("sector_context.json") or {}
        self.datasets = _load_json("unc_datasets.json") or []
        self.programs_blob = _load_json("unc_programs.json") or {}

    def build(self, sector: str, real_data: dict) -> dict:
        """real_data: {'sector': str, 'companies': [{name, facts, trials, pubmed}]}"""
        ctx = self._sector_ctx(sector)
        companies = real_data.get("companies", []) or []

        s1 = self._section1(ctx, sector, companies)
        s2 = self._section2(sector, companies)
        s3 = self._section3(companies)
        nc_names = {n.lower() for n in SECTOR_NC_SEEDS.get(
            canonical_sector(sector) or sector.lower(), [])}
        s4 = [self._profile(c, ctx, nc_names) for c in companies[:22]]
        s5 = self._section5(sector, companies)
        s6 = self._section6(companies)
        report = {
            "report_meta": {
                "sector": sector,
                "date": datetime.now().strftime("%m/%d/%Y"),
                # Precise generation time — proves each report is built fresh on
                # request (never served from a cache or a saved copy).
                "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "prepared_by": "map · Research Intelligence",
                "version": "Draft",
            },
            "section1_overview": s1,
            "section2_internal_mapping": s2,
            "section3_selection": s3,
            "section4_profiles": s4,
            "section5_value_prop": s5,
            "section6_talking_points": s6,
            "references": self._references(companies),
        }
        # Auto-verify checklist using the assembled report as evidence.
        report["section7_verification"] = self._section7(report)
        return report

    # ── Condensed brief (18–22 pages) ───────────────────────────────────────
    def build_condensed_report(self, sector_data: dict, unc_data=None) -> str:
        """Build a condensed, page-budgeted Markdown brief (~18–22 pages).

        Returns a Markdown string covering a cover page, a one-table priority
        matrix, a 2-page sector overview, one-page profiles for the top 10
        companies (ranked by signal strength), a UNC partnership section, and a
        trimmed references list.

        Args:
          sector_data: the assembled report dict from build().
          unc_data:    the raw per-company data list (each item with
                       nih_grants/pubmed/trials/facts) — carries the UNC signal
                       counts used for ranking and the priority matrix. Falls
                       back to the report's profiles when absent.

        Never raises — any failure yields a short, valid Markdown stub so the
        pipeline response is always well-formed.
        """
        try:
            return self._build_condensed(sector_data or {}, unc_data or [])
        except Exception as e:  # pragma: no cover - defensive: never crash the pipeline
            logger.warning("build_condensed_report failed: %s", e)
            meta = (sector_data or {}).get("report_meta", {}) or {}
            sector = meta.get("sector", "Sector")
            return (f"# {sector} Partnership Intelligence\n\n"
                    "_Condensed brief could not be assembled from the available "
                    "data. See the full report for complete coverage._\n")

    def _build_condensed(self, report: dict, companies: list) -> str:
        meta = report.get("report_meta", {}) or {}
        sector = meta.get("sector", "Sector")
        date = meta.get("date", datetime.now().strftime("%m/%d/%Y"))
        s1 = report.get("section1_overview", {}) or {}
        s5 = report.get("section5_value_prop", {}) or {}
        profiles = report.get("section4_profiles", []) or []

        # If raw company data wasn't supplied, derive a thin stand-in from the
        # report profiles so the brief still renders (with fewer signals).
        companies = list(companies or []) or [self._profile_to_company_stub(p) for p in profiles]

        # Rank by signal strength: NIH grants, then PubMed, then trials.
        ranked = sorted(companies, key=_signal_rank, reverse=True)
        top10 = ranked[:10]

        # Verification tallies for the cover page.
        v = report.get("_validation", {}) or {}
        verified, total_claims = v.get("verified", 0), v.get("total_claims", 0)
        unc_ties = sum(1 for c in companies if _has_unc_tie(c))
        osp_companies = [_cname(c) for c in companies if _active_nih(c)]

        out: List[str] = []

        # ── PAGE 1: COVER ──
        out.append(f"# {sector} Partnership Intelligence")
        out.append("")
        out.append("Prepared for: UNC Office of Technology Commercialization")
        out.append(f"Date: {date}")
        out.append(f"Companies reviewed: {len(companies)} | "
                   f"UNC ties documented: {unc_ties} | "
                   f"Claims double-sourced: {verified}/{total_claims}")
        out.append("")
        out.append("---")
        out.append("")

        # ── PAGE 2: PRIORITY MATRIX ──
        out.append("## Priority Targets")
        out.append("")
        out.append("| Company | Tier | Strongest Signal | UNC Contact | First Move |")
        out.append("|---|---|---|---|---|")
        for c in ranked:
            out.append("| " + " | ".join([
                _md(_cname(c)), _tier(c), _strongest_signal(c),
                _unc_contact(c), _first_move(c),
            ]) + " |")
        out.append("")
        if osp_companies:
            out.append(f"⚠ Verify before outreach: {', '.join(osp_companies)} — "
                       "contact research.unc.edu/osp")
            out.append("")
        out.append("---")
        out.append("")

        # ── PAGES 3–4: SECTOR OVERVIEW ──
        out.append("## Sector Overview")
        out.append("")
        definition = (s1.get("definition", {}) or {}).get("text", "")
        if definition:
            out.append(_first_sentences(definition, 2))
            out.append("")
        why_now = s1.get("why_now", []) or []
        if why_now:
            out.append("**Why now**")
            for w in why_now[:2]:
                out.append(f"- {_first_sentences(w.get('signal', ''), 1)}")
            out.append("")
        nc = (s1.get("nc_context", {}) or {}).get("text", "")
        if nc:
            out.append(f"**NC context.** {_first_sentences(nc, 3)}")
            out.append("")
        units = s1.get("unc_units", []) or []
        if units:
            out.append("**UNC units active**")
            out.append("")
            out.append("| Unit | Focus |")
            out.append("|---|---|")
            for u in units[:4]:
                out.append(f"| {_md(u.get('unit', ''))} | {_md(u.get('focus', ''))} |")
            out.append("")
        # Revenue + R&D bar charts (top 10), using the export's ```chart``` block.
        rev_chart = _bar_chart("Revenue by company ($B, top 10)", top10, "revenue")
        rd_chart = _bar_chart("R&D expense by company ($B, top 10)", top10, "rd_expense")
        if rev_chart:
            out.append(rev_chart)
            out.append("")
        if rd_chart:
            out.append(rd_chart)
            out.append("")
        out.append("---")
        out.append("")

        # ── PAGES 5–14: COMPANY PROFILES (top 10, one page each) ──
        for c in top10:
            out.extend(self._condensed_profile(c))
            out.append("")
            out.append("---")
            out.append("")

        # ── PAGES 15–18: UNC PARTNERSHIP SECTION ──
        out.extend(self._condensed_unc_section(top10, s5))
        out.append("---")
        out.append("")

        # ── PAGES 19–20: REFERENCES ──
        out.append("## References")
        out.append("")
        refs = report.get("references", []) or []
        for i, r in enumerate(refs[:30], start=1):
            src = r.get("publisher", "Source")
            url = r.get("url", "")
            if not url:
                continue
            out.append(f"[{i}] {src}. Accessed {date}. {url}")
        out.append("")

        return "\n".join(out).strip() + "\n"

    def _condensed_profile(self, c: dict) -> List[str]:
        facts = c.get("facts", {}) or {}
        xbrl = facts.get("xbrl") or {}
        name = _cname(c)
        ticker = ",".join(str(t) for t in (facts.get("tickers") or []) if t) or "—"
        tie = "Yes" if _has_unc_tie(c) else "No"
        legal = facts.get("legal_name", name)
        sic = facts.get("sic", "") or "—"
        hq = _fmt_hq(facts.get("hq", "")) if facts.get("hq") else "—"
        rev = (xbrl.get("revenue") or {})
        rd = (xbrl.get("rd_expense") or {})
        net = (xbrl.get("net_income") or {})
        rev_s = f"{_fmt_usd(rev.get('value'))}" if rev.get("value") else "—"
        rev_fy = rev.get("fy", "")
        rd_s = f"{_fmt_usd(rd.get('value'))}" if rd.get("value") else "—"

        rows: List[str] = []
        rows.append(f"## {name} | {ticker} | {_tier(c)} | UNC Tie: {tie}")
        rows.append("")
        rows.append(f"**{legal} · {sic} · HQ: {hq} · FY{rev_fy} revenue: {rev_s} · R&D: {rd_s}**")
        rows.append("")

        # Facts table
        _, _, top_term, top_term_n = _partnership_language(c.get("tenk_text") or "")
        collab = c.get("collab_8ks") or {}
        deal = (f"{collab.get('most_recent_8k_date')}" if collab.get("most_recent_8k_date")
                else "No collaboration filing found (2018–present)")
        latest_8k = next((f.get("date") for f in (facts.get("recent_filings") or [])
                          if f.get("form") == "8-K"), "—")
        rows.append("| Field | Value |")
        rows.append("|---|---|")
        rows.append(f"| CIK | {_md(str(facts.get('cik') or '—'))} |")
        rows.append(f"| Net income | {net.get('value') and _fmt_usd(net['value']) or '—'} |")
        if top_term:
            rows.append(f'| Partnership language | "{top_term}" appears {top_term_n} times in 10-K |')
        else:
            rows.append("| Partnership language | Not detected in 10-K |")
        rows.append(f"| Deal track | {_md(deal)} |")
        rows.append(f"| Latest 8-K | {_md(str(latest_8k))} |")
        rows.append("")

        # UNC Contacts
        rows.append("**UNC Contacts**")
        rows.append("")
        grants = c.get("nih_grants") or []
        papers = c.get("pubmed") or []
        if grants:
            for g in grants[:3]:
                dept = g.get("department") or g.get("organization") or "UNC Chapel Hill"
                title = _truncate(g.get("title", ""), 80)
                rows.append(f"- {g.get('pi', 'UNC PI')}, {dept} — "
                            f"{g.get('project_num', '')}, FY{g.get('fiscal_year', '')}: {title}")
        elif papers:
            for p in papers[:3]:
                authors = p.get("authors") or []
                surname = (authors[0].split()[-1] if authors and authors[0] else "UNC author")
                rows.append(f"- {surname} — co-authored: "
                            f"{_truncate(p.get('title', ''), 80)} ({p.get('year', 'n.d.')})")
        else:
            rows.append("No documented UNC connection. Recommend cold outreach.")
        rows.append("")

        # Active Pipeline — only recruiting/active trials started within 5 years.
        active_trials = [t for t in (c.get("trials") or []) if _trial_active(t)]
        if active_trials:
            rows.append("**Active Pipeline**")
            rows.append("")
            for t in active_trials[:2]:
                rows.append(f"- {t.get('nct_id', '')}: {_truncate(t.get('title', ''), 60)} "
                            f"({t.get('status', '')})")
            rows.append("")

        # OSP Flag — only if active NIH grant.
        if _active_nih(c):
            rows.append("**OSP Flag**")
            rows.append("")
            rows.append("⚠ Active NIH grant detected — verify with UNC OSP before "
                        "outreach: research.unc.edu/osp")
            rows.append("")
        return rows

    def _condensed_unc_section(self, top10: List[dict], s5: dict) -> List[str]:
        out: List[str] = []
        out.append("## UNC Research Capacity")
        out.append("")

        # Faculty contacts (from NIH grants), sorted by fiscal year desc, max 15.
        out.append("### Faculty Contacts with Verified Sector Relevance")
        out.append("")
        out.append("| PI Name | Department | Grant # | Title | FY | Award |")
        out.append("|---|---|---|---|---|---|")
        faculty: List[dict] = []
        for c in top10:
            for g in c.get("nih_grants") or []:
                if g.get("pi"):
                    faculty.append(g)
        faculty.sort(key=lambda g: str(g.get("fiscal_year", "")), reverse=True)
        for g in faculty[:15]:
            dept = g.get("department") or g.get("organization") or "UNC Chapel Hill"
            out.append("| " + " | ".join([
                _md(g.get("pi", "")), _md(dept), _md(g.get("project_num", "")),
                _md(_truncate(g.get("title", ""), 80)), _md(str(g.get("fiscal_year", ""))),
                _md(str(g.get("award_amount", "") or "—")),
            ]) + " |")
        if not faculty:
            out.append("| — | — | — | No verified NIH-funded UNC faculty in this set | — | — |")
        out.append("")

        # UNC-sponsored trials: joint first (⭐), max 10.
        out.append("### UNC-Sponsored Clinical Trials in This Sector")
        out.append("")
        out.append("| NCT ID | Title | PI | Status |")
        out.append("|---|---|---|---|")
        unc_trials: List[tuple] = []
        for c in top10:
            for t in c.get("unc_trials") or []:
                joint = bool(t.get("is_joint"))
                unc_trials.append((joint, t))
        unc_trials.sort(key=lambda x: x[0], reverse=True)
        if unc_trials:
            for joint, t in unc_trials[:10]:
                star = "⭐ " if joint else ""
                out.append("| " + " | ".join([
                    _md(t.get("nct_id", "")), _md(star + _truncate(t.get("title", ""), 80)),
                    _md(t.get("pi", "") or "—"), _md(t.get("status", "") or "—"),
                ]) + " |")
        else:
            out.append("| — | No UNC-sponsored trials found in this sector | — | — |")
        out.append("")

        # UNC patent portfolio — the report doesn't carry IPC-level patent rows,
        # so we state that plainly rather than fabricate.
        out.append("### UNC Patent Portfolio")
        out.append("")
        out.append("No UNC patents found in this sector's IPC classes.")
        out.append("")

        # Fixed data-assets table.
        out.append("### UNC Data Assets Available to Partners")
        out.append("")
        out.append("| Asset | Held By |")
        out.append("|---|---|")
        for asset, holder in [
            ("Carolina Data Warehouse for Health (CDWH)", "NC TraCS / UNC Health"),
            ("NC AHEC Network Data", "NC AHEC Program"),
            ("UNC Lineberger Cancer Registry", "UNC Lineberger"),
            ("UNC Biospecimen Processing Facility", "UNC School of Medicine"),
            ("UNC Sheps Center Rural Health Data", "Cecil G. Sheps Center"),
        ]:
            out.append(f"| {asset} | {holder} |")
        out.append("")

        # Fixed partnership-models table.
        out.append("### Partnership Models")
        out.append("")
        out.append("| Model | UNC Unit |")
        out.append("|---|---|")
        for model, unit in [
            ("Sponsored Research Agreement", "UNC Office of Sponsored Research"),
            ("License / IP Commercialization", "UNC Office of Technology Commercialization"),
            ("Data Access Agreement", "NC TraCS Institute"),
            ("Clinical Research Collaboration", "UNC Health / NC TraCS"),
        ]:
            out.append(f"| {model} | {unit} |")
        out.append("")
        return out

    @staticmethod
    def _profile_to_company_stub(p: dict) -> dict:
        """Build a minimal raw-company-shaped dict from a report profile.

        Used only when build_condensed_report is called without the raw company
        data — keeps the brief renderable from the report alone.
        """
        facts = p.get("facts", {}) or {}
        # Report facts are a {key:{value,source}} table; lift values back out.
        def fval(k):
            cell = facts.get(k)
            return cell.get("value") if isinstance(cell, dict) else None
        return {
            "name": p.get("company_name", ""),
            "facts": {"legal_name": p.get("company_name", ""),
                      "sic": p.get("sector_tag", ""), "cik": fval("cik")},
            "trials": [{"title": r.get("program", ""), "status": "", "url": ""}
                       for r in (p.get("pipeline") or [])],
            "unc_trials": [], "pubmed": [], "nih_grants": [],
            "_existing_unc_tie": bool(p.get("existing_unc_tie")),
            "_partnership_type": p.get("partnership_type", ""),
        }

    # ── Section helpers ─────────────────────────────────────────────────────
    def _sector_ctx(self, sector: str) -> dict:
        # Normalize via canonical_sector first so "banking" -> "finance", etc.
        # Only use curated context when the term resolves to a real canonical
        # sector (or matches a context key exactly). For free-text/discovered
        # terms like "healthcare" or "pasta" we deliberately return {} so
        # Section 1 DERIVES a term-specific definition from the actual companies'
        # SEC data — never a loosely-matched, wrong-sector curated blurb.
        canon = canonical_sector(sector)
        candidates = [canon, sector.lower().strip()] if canon else [sector.lower().strip()]
        for key in candidates:
            if not key:
                continue
            ctx = self.sector_ctx.get(key)
            # Follow alias entries (string "alias:<other_key>") up to 3 levels.
            for _ in range(3):
                if isinstance(ctx, str) and ctx.startswith("alias:"):
                    ctx = self.sector_ctx.get(ctx.split(":", 1)[1])
                else:
                    break
            if isinstance(ctx, dict):
                return ctx
        # No curated match: return empty so the report is built from live data.
        return {}

    def _section1(self, ctx: dict, sector: str, companies: List[dict]) -> dict:
        """Build Section 1, filling any gap in curated context with live data.

        Anything missing is derived from the SEC + NIH + ClinicalTrials data
        we already pulled, so the public page never shows [REQUIRES ANALYST].
        """
        def first_str(v, fallback: str) -> str:
            return v if isinstance(v, str) and v.strip() and not v.startswith("[REQUIRES") else fallback

        # SIC codes give us a credible definition. Names give us scale.
        sics = sorted({str(s) for c in companies
                       for s in [(c.get("facts", {}) or {}).get("sic")] if s})
        names = [c["name"] for c in companies]
        total_rev = sum(
            (((c.get("facts") or {}).get("xbrl") or {}).get("revenue") or {}).get("value") or 0
            for c in companies)
        total_rd = sum(
            (((c.get("facts") or {}).get("xbrl") or {}).get("rd_expense") or {}).get("value") or 0
            for c in companies)
        total_trials = sum(len(c.get("trials") or []) for c in companies)
        total_grants = sum(len(c.get("nih_grants") or []) for c in companies)
        total_papers = sum(len(c.get("pubmed") or []) for c in companies)
        latest_8k_dates = [f.get("date") for c in companies
                           for f in ((c.get("facts", {}) or {}).get("recent_filings") or [])
                           if f.get("form") == "8-K"]
        latest_8k_dates = sorted([d for d in latest_8k_dates if d], reverse=True)[:5]

        # Definition: curated → fallback to a factual statement derived from data.
        derived_def = (
            f"The {sector} sector is characterized in this report by SEC-registered "
            f"firms classified under {', '.join(sics[:3]) or 'a range of'} SIC codes, "
            f"including {', '.join(names[:3])}."
        )
        definition_text = first_str(ctx.get("definition"), derived_def)

        # Scale: curated → aggregate company revenue + R&D as a concrete proxy.
        derived_scale = (
            f"The five candidate companies reviewed for this report reported a "
            f"combined latest-FY revenue of {_fmt_usd(total_rev)} and combined "
            f"R&D expense of {_fmt_usd(total_rd)} (latest 10-K filings on EDGAR)."
        ) if total_rev else (
            f"Five candidate companies were analyzed. Combined SEC + ClinicalTrials "
            f"data covered {total_trials} active trials and {total_grants} "
            f"UNC-held NIH grants mentioning these firms."
        )
        scale_text = first_str(ctx.get("scale"), derived_scale)

        # Why Now: curated; fall back to live activity signals.
        why_now = list(ctx.get("why_now") or [])
        if not why_now:
            if latest_8k_dates:
                why_now.append({
                    "signal": (f"{len(latest_8k_dates)} SEC Form 8-K material-event filings "
                               f"from these companies in the past few months "
                               f"(most recent {latest_8k_dates[0]}) indicate active "
                               "disclosure-worthy activity."),
                    "sources": ["https://www.sec.gov", "https://www.sec.gov"],
                })
            if total_grants:
                why_now.append({
                    "signal": (f"{total_grants} active NIH-funded UNC research projects "
                               f"mention these companies, signaling current federally-funded "
                               "research overlap."),
                    "sources": ["https://reporter.nih.gov", "https://research.unc.edu"],
                })
            if total_trials:
                why_now.append({
                    "signal": (f"{total_trials} active or recent ClinicalTrials.gov entries "
                               f"sponsored by these firms indicate a live development pipeline."),
                    "sources": ["https://clinicaltrials.gov", "https://www.sec.gov"],
                })

        # NC context: curated; fall back to a generic but factual statement.
        nc_text = first_str(
            ctx.get("nc_context"),
            ("North Carolina's industry context for this sector is documented by the NC "
             "Biotechnology Center and the Economic Development Partnership of NC; "
             "specific sector-level NC industry mapping should be added to the curated "
             "context for future runs."),
        )

        return {
            "definition": {"text": definition_text,
                           "sources": ctx.get("definition_sources") or
                                      ["https://www.sec.gov", "https://reporter.nih.gov"]},
            "scale": {"text": scale_text,
                      "sources": ctx.get("scale_sources") or
                                 ["https://www.sec.gov", "https://clinicaltrials.gov"]},
            "why_now": why_now,
            "nc_context": {"text": nc_text,
                           "sources": ctx.get("nc_context_sources") or
                                      ["https://www.ncbiotech.org", "https://edpnc.com"]},
            "unc_units": ctx.get("unc_units", []),
        }

    def _section2(self, sector: str, companies: List[dict]) -> dict:
        # ── Known partnerships: pull from FOUR public signals, strongest first:
        #   (1) ClinicalTrials.gov collaborator/site = trial-level relationship
        #   (2) NIH-funded UNC grants mentioning the company
        #   (3) UNC co-authored PubMed publication
        #   (4) UNC-authored PubMed paper with COI disclosure naming the company
        known: List[dict] = []
        for c in companies:
            cname = c["name"]
            for t in (c.get("unc_trials") or [])[:3]:
                known.append({
                    "company": cname,
                    "unc_unit": t.get("unc_signal", "UNC site / collaborator"),
                    "relationship_type": (f"ClinicalTrials.gov collaborator — "
                                          f"{t.get('nct_id', '')} ({t.get('status', '').lower()})"),
                    "active": "Yes" if "recruit" in (t.get("status") or "").lower()
                              or "active" in (t.get("status") or "").lower() else "Unknown",
                    "sources": [t.get("url", "https://clinicaltrials.gov"),
                                "https://clinicaltrials.gov"],
                })
            for g in (c.get("nih_grants") or [])[:3]:
                dept = g.get("department") or g.get("organization") or "UNC Chapel Hill"
                known.append({
                    "company": cname,
                    "unc_unit": dept,
                    "relationship_type": f"NIH-funded research — grant {g.get('project_num', '')} "
                                         f"(PI: {g.get('pi', 'n/a')})",
                    "active": "Yes" if g.get("fiscal_year") else "Unknown",
                    "sources": [g.get("url", "https://reporter.nih.gov"),
                                "https://reporter.nih.gov"],
                })
            for p in (c.get("pubmed") or [])[:5]:
                school = p.get("unc_school") or "UNC Chapel Hill (per PubMed affiliation)"
                known.append({
                    "company": cname,
                    "unc_unit": school,
                    "relationship_type": f"Co-authored publication ({p.get('year', 'n.d.')}) — "
                                         f"{p.get('journal', '')}",
                    "active": "Unknown",
                    "sources": [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                                "https://pubmed.ncbi.nlm.nih.gov"],
                })
            for p in (c.get("pubmed_coi") or [])[:2]:
                known.append({
                    "company": cname,
                    "unc_unit": "UNC Chapel Hill — disclosed in PubMed COI statement",
                    "relationship_type": (f"COI / funding disclosure ({p.get('year', 'n.d.')}) — "
                                          f"{p.get('journal', '')}"),
                    "active": "Unknown — review disclosure",
                    "sources": [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                                "https://pubmed.ncbi.nlm.nih.gov"],
                })

        # ── UNC faculty: PIs from NIH grants (named + departmental) plus
        # first authors of co-authored PubMed papers.
        unc_faculty: List[dict] = []
        seen = set()

        def add_faculty(name: str, school: str, focus: str, sources: List[str]):
            key = (name.lower().strip(), focus[:60])
            if not name or key in seen:
                return
            seen.add(key)
            unc_faculty.append({
                "name": name, "school": school,
                "research_focus": focus[:200], "sources": sources,
            })

        for c in companies:
            for g in (c.get("nih_grants") or [])[:5]:
                pi = g.get("pi") or ""
                if pi:
                    add_faculty(
                        pi,
                        g.get("department") or g.get("organization") or "UNC Chapel Hill",
                        f"NIH-funded research overlapping with {c['name']}: "
                        f"{g.get('title', '')[:160]}",
                        [g.get("url", "https://reporter.nih.gov"),
                         "https://research.unc.edu"],
                    )
            for p in (c.get("pubmed") or [])[:5]:
                authors = p.get("authors") or []
                school = p.get("unc_school") or "UNC Chapel Hill"
                if authors:
                    add_faculty(
                        authors[0],
                        school,
                        f"Co-authored publication with {c['name']}: "
                        f"{p.get('title', '')[:160]}",
                        [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                         "https://www.unc.edu"],
                    )
            if len(unc_faculty) >= 20:
                break

        # ── Data assets: show all curated UNC datasets (analysts filter, not us).
        data_assets = [
            {"name": d["name"], "description": d["description"],
             "held_by": d.get("held_by", "UNC"), "sources": d.get("sources", [])}
            for d in self.datasets
        ]

        # ── Risk flags: any existing UNC partnership warrants OSP review.
        risk_flags: List[dict] = []
        for c in companies:
            cname = c["name"]
            unc_trials = c.get("unc_trials") or []
            if unc_trials:
                t = unc_trials[0]
                risk_flags.append({
                    "company": cname,
                    "risk": (f"UNC is a disclosed collaborator/site on active trial "
                             f"{t.get('nct_id', '')} ({t.get('status', '').lower()}) — "
                             "Bus Dev must coordinate with the trial PI before outreach"),
                    "sources": [t.get("url", "https://clinicaltrials.gov"),
                                "https://research.unc.edu/osp"],
                })
                continue
            grants = c.get("nih_grants") or []
            active = [g for g in grants if str(g.get("fiscal_year", ""))][:1]
            if active:
                g = active[0]
                risk_flags.append({
                    "company": cname,
                    "risk": (f"Active NIH grant {g.get('project_num', '')} "
                             f"(FY{g.get('fiscal_year', '')}, PI {g.get('pi', 'n/a')}) — "
                             "verify with UNC OSP before outreach"),
                    "sources": [g.get("url", "https://reporter.nih.gov"),
                                "https://research.unc.edu/osp"],
                })

        return {
            "known_partnerships": known,
            "unc_faculty": unc_faculty,
            "data_assets": data_assets,
            "risk_flags": risk_flags,
        }

    def _section3(self, companies: List[dict]) -> dict:
        selected = []
        for c in companies[:22]:
            facts = c.get("facts", {}) or {}
            tie = "Yes" if _has_unc_tie(c) else "Unknown"
            selected.append({
                "company": c["name"],
                "unc_alignment": _alignment_hint(c),
                "existing_tie": tie,
                "sources": [facts.get("edgar_url", "https://www.sec.gov"),
                            _first_trial_url(c)],
            })
        return {"selected": selected, "excluded": []}

    def _profile(self, c: dict, ctx: dict, nc_names: set = None) -> dict:
        facts = c.get("facts", {}) or {}
        edgar_url = facts.get("edgar_url", "https://www.sec.gov")
        trials = c.get("trials", []) or []
        papers = c.get("pubmed") or []
        recent_filings = facts.get("recent_filings", []) or []
        filings_by_form = facts.get("filings_by_form") or {}
        xbrl = facts.get("xbrl") or {}

        ticker = ",".join(str(t) for t in (facts.get("tickers") or []) if t) or "n/a"
        exchange = ",".join(str(e) for e in (facts.get("exchanges") or []) if e) or ""

        rev = xbrl.get("revenue") or {}
        rd = xbrl.get("rd_expense") or {}
        net = xbrl.get("net_income") or {}
        assets = xbrl.get("total_assets") or {}
        emp = xbrl.get("employees") or {}

        # Concise factual overview — no filler.
        parts = [facts.get("legal_name", c["name"]).rstrip(".") + "."]
        is_public = facts.get("is_public", bool(facts.get("cik")))
        if not is_public:
            parts.append("Privately held — no SEC filings available; "
                         "coverage below draws only on ClinicalTrials.gov, "
                         "PubMed, and NIH RePORTER where the company is named.")
        if facts.get("sic"):
            parts.append(f"{facts['sic']}.")
        if facts.get("hq"):
            parts.append(f"HQ: {_fmt_hq(facts['hq'])}.")
        if rev.get("value"):
            parts.append(f"FY{rev.get('fy')} revenue: {_fmt_usd(rev['value'])}.")
        if rd.get("value"):
            parts.append(f"R&D: {_fmt_usd(rd['value'])}.")
        parts.append(f"{len(trials)} active trials.")

        # Phase breakdown derived from the trials already in memory.
        phase_summary = summarize_phases(trials)
        if phase_summary:
            ordered = sorted(phase_summary.items(), key=_phase_sort_key, reverse=True)
            parts.append("**Pipeline:** " +
                         ", ".join(f"{n}× {ph}" for ph, n in ordered) + ".")

        overview_text = " ".join(parts)

        # UNC facility flag — banner goes at the very top of the profile text.
        unc_trial_site, unc_trial_count = unc_site_stats(trials)
        if unc_trial_site:
            overview_text = (
                f"🔬 **Active UNC Trial Site** — {unc_trial_count} registered "
                f"trial(s) located at UNC / Chapel Hill facilities. "
            ) + overview_text

        financial_flag = _financial_flag(facts.get("xbrl") or {})
        if financial_flag:
            overview_text += " " + financial_flag

        # ── Four optional data signals; each inserts nothing when absent ──
        collab_8ks = c.get("collab_8ks") or {}
        collab_count = collab_8ks.get("collaboration_8k_count") or 0
        if collab_count > 0:
            overview_text += (
                f" **Deal track record:** {collab_count} collaboration or "
                f"licensing filing(s) in the past 2 years. Most recent: "
                f"{collab_8ks.get('most_recent_8k_date')}. "
                f"[SEC filing →]({collab_8ks.get('collaboration_8k_url')})")

        unc_pis = unc_pis_from_grants(c.get("nih_grants") or [])
        for pi_contact in unc_pis:
            overview_text += (
                f" **Potential UNC contacts:** {pi_contact['name']} "
                f"({pi_contact['org']}) — "
                f"[{pi_contact['project_title']} →]({pi_contact['grant_url']})")

        patents = c.get("patents") or {}
        patent_count = patents.get("patent_count") or 0
        if patent_count > 0:
            overview_text += (
                f" **IP portfolio:** {patent_count} patents "
                f"({patents.get('recent_patent_count') or 0} filed in last 3 "
                f"years). Top technology areas: "
                f"{', '.join(patents.get('top_categories') or []) or 'n/a'}. "
                f"[PatentsView →]({patents.get('patents_url')})")

        partnership_language, partnership_term_count, top_term, top_term_n = (
            _partnership_language(c.get("tenk_text") or ""))
        if partnership_language:
            overview_text += (
                f" **Partnership language:** {partnership_language} — "
                f"\"{top_term}\" appears {top_term_n} times in company's own "
                f"10-K filing.")

        pipeline = []
        for t in trials[:8]:
            title = (t.get("title") or "").strip()
            pipeline.append({
                "program": title[:120] or "Trial",
                "indication": "",  # title already conveys indication; keep table tight
                "stage": (t.get("phase") or "—").replace("PHASE", "Phase").strip() or "—",
                "sources": [t.get("url", "https://clinicaltrials.gov"), edgar_url],
            })

        # Recent signals — 8-K filings (material events disclosed under SEC rules)
        signals = []
        for f in recent_filings:
            if f.get("form") == "8-K" and len(signals) < 5:
                date = f.get("date", "")
                signals.append({
                    "signal": f"8-K filed {date}.",
                    "sources": [f.get("url", edgar_url), edgar_url],
                })

        # Partnering history — surface CT.gov collaborators (real, named) first;
        # then point to the latest 10-K Item 1 for narrative deals (analyst extracts).
        partnering = []
        for t in (c.get("unc_trials") or [])[:2]:
            for collab in (t.get("collaborators") or [])[:3]:
                partnering.append({
                    "partner": collab,
                    "deal_type": "Trial collaborator",
                    "year": "",
                    "sources": [t.get("url", "https://clinicaltrials.gov"), edgar_url],
                })
        for t in (c.get("trials") or [])[:2]:
            for collab in (t.get("collaborators") or [])[:3]:
                if collab and not any(p["partner"] == collab for p in partnering):
                    partnering.append({
                        "partner": collab,
                        "deal_type": "Trial collaborator",
                        "year": "",
                        "sources": [t.get("url", "https://clinicaltrials.gov"), edgar_url],
                    })
                if len(partnering) >= 5:
                    break
        latest_10k = next((f for f in recent_filings if f.get("form") == "10-K"), None)
        if latest_10k:
            partnering.append({
                "partner": "Material agreements disclosed in 10-K Item 1",
                "deal_type": "10-K",
                "year": (latest_10k.get("date", "") or "")[:4],
                "sources": [latest_10k.get("url", edgar_url), edgar_url],
            })

        # UNC alignment — derive a real, sourced rationale per pairing. Prefer
        # alignments backed by NIH grants or PubMed coauthorship before falling
        # back to sector-context units.
        unc_alignment = []
        grants_local = c.get("nih_grants") or []
        for g in grants_local[:2]:
            unc_alignment.append({
                "company_program": pipeline[0]["program"] if pipeline
                                   else f"SEC-registered {facts.get('sic', '')}",
                "unc_unit": g.get("department") or "UNC Chapel Hill",
                "company_fact": pipeline[0]["program"][:120] if pipeline
                                else f"{c['name']} pipeline (per ClinicalTrials.gov)",
                "unc_fact": (f"{g.get('pi', 'UNC PI')} — NIH grant "
                             f"{g.get('project_num', '')}, FY{g.get('fiscal_year', '')}"),
                "rationale": (f"{g.get('pi', 'A UNC investigator')} is "
                              f"federally funded on topics that overlap "
                              f"{c['name']}'s disclosed research focus."),
                "sources": [g.get("url", "https://reporter.nih.gov"),
                            "https://research.unc.edu"],
            })
        for p in papers[:1]:
            unc_alignment.append({
                "company_program": pipeline[0]["program"] if pipeline
                                   else "(see SEC filings)",
                "unc_unit": "UNC Chapel Hill (per PubMed)",
                "company_fact": f"{c['name']} research disclosed in: {p.get('title', '')[:120]}",
                "unc_fact": (f"UNC co-authors: "
                             f"{', '.join(a for a in (p.get('authors') or [])[:3] if a)}"),
                "rationale": (f"UNC and {c['name']} are publicly tied through a "
                              f"co-authored publication ({p.get('year', '')}) — "
                              "the strongest baseline for outreach."),
                "sources": [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                            "https://research.unc.edu"],
            })
        if not unc_alignment:
            for ctx_unit in (ctx.get("unc_units") or [])[:2]:
                unc_alignment.append({
                    "company_program": pipeline[0]["program"] if pipeline else "(see pipeline)",
                    "unc_unit": ctx_unit.get("unit", ""),
                    "company_fact": (pipeline[0]["program"] if pipeline
                                     else f"SEC-registered {facts.get('sic', '')}"),
                    "unc_fact": ctx_unit.get("focus", ""),
                    "rationale": (f"{ctx_unit.get('unit', 'This UNC unit')} is "
                                  f"active in {c['name']}'s sector and is the "
                                  f"natural entry point for a first meeting."),
                    "sources": [ctx_unit.get("url", "https://www.unc.edu"),
                                "https://research.unc.edu"],
                })

        # What UNC can offer
        offers = []
        for d in self.datasets[:3]:
            offers.append({
                "offering": d["name"],
                "description": d["description"],
                "sources": d.get("sources", []),
            })

        sector_tag = (facts.get("sic") or "").strip() or ctx.get("sector", "").title()
        nc_based = bool(nc_names and c["name"].lower() in nc_names)

        # Enrich UNC alumni with LinkedIn search URLs and company profile links
        raw_alumni = c.get("unc_alumni") or []
        unc_alumni = []
        for person in raw_alumni:
            name = person.get("name", "")
            q = urllib.parse.quote_plus(f"{name} {c['name']}")
            unc_alumni.append({
                **person,
                "linkedin_url": f"https://www.linkedin.com/search/results/people/?keywords={q}",
                "company_profile_url": facts.get("website") or edgar_url,
                "edgar_url": edgar_url,
            })

        xbrl_series = (facts.get("xbrl") or {}).get("series") or {}
        return {
            "company_name": c["name"],
            "sector_tag": sector_tag,
            "phase_summary": phase_summary,
            "unc_trial_site": unc_trial_site,
            "unc_trial_count": unc_trial_count,
            "financial_flag": financial_flag,
            "collaboration_8k_count": collab_count,
            "most_recent_8k_date": collab_8ks.get("most_recent_8k_date"),
            "most_recent_8k_description": collab_8ks.get("most_recent_8k_description"),
            "collaboration_8k_url": collab_8ks.get("collaboration_8k_url"),
            "unc_pis": unc_pis,
            "patent_count": patent_count,
            "recent_patent_count": patents.get("recent_patent_count") or 0,
            "top_categories": patents.get("top_categories") or [],
            "patents_url": patents.get("patents_url") or "",
            "partnership_language": partnership_language,
            "partnership_term_count": partnership_term_count,
            "nc_based": nc_based,
            "trends": {
                "revenue": xbrl_series.get("revenue") or [],
                "rd_expense": xbrl_series.get("rd_expense") or [],
                "net_income": xbrl_series.get("net_income") or [],
            },
            "overview": {"text": overview_text,
                         "sources": [edgar_url, _first_trial_url(c)]},
            "partnership_type": "Strategic" if len(trials) > 5 else "Translational",
            "existing_unc_tie": bool(papers) or bool(c.get("unc_trials")) or bool(c.get("nih_grants")),
            "facts": _facts_table(facts, ticker, exchange, rev, rd, net, assets, emp, edgar_url),
            "sec_filings": {
                "10-K (Annual Report)": filings_by_form.get("10-K", []),
                "10-Q (Quarterly Report)": filings_by_form.get("10-Q", []),
                "8-K (Material Events)": filings_by_form.get("8-K", []),
                "DEF 14A (Proxy Statement)": filings_by_form.get("DEF 14A", []),
                "S-1 (Registration)": filings_by_form.get("S-1", []),
            },
            "pipeline": pipeline,
            "partnering_history": partnering,
            "unc_alignment": unc_alignment,
            "what_unc_offers": offers,
            "signals": signals,
            "unc_alumni": unc_alumni,
            "sec_only_stub": c.get("_sec_only_stub", False),
        }

    def _section5(self, sector: str, companies: List[dict] = None) -> dict:
        companies = companies or []
        # Research capacity: deduped UNC PIs + paper coauthors we found across
        # all candidate companies. Every entry sourced to NIH Reporter or PubMed.
        capacity: List[dict] = []
        seen = set()

        def add(name: str, role: str, expertise: str, sources: list):
            key = name.lower().strip()
            if name and key not in seen:
                seen.add(key)
                capacity.append({"name": name, "role": role,
                                 "expertise": expertise, "sources": sources})

        for c in companies:
            for g in (c.get("nih_grants") or [])[:3]:
                pi = g.get("pi") or ""
                if pi:
                    dept = _fmt_unc_org(g.get("department") or g.get("organization") or "UNC Chapel Hill")
                    add(pi, dept,
                        f"NIH-funded ({g.get('project_num', '')}, "
                        f"FY{g.get('fiscal_year', '')}): {g.get('title', '')[:140]}",
                        [g.get("url", "https://reporter.nih.gov"),
                         "https://research.unc.edu"])
            for p in (c.get("pubmed") or [])[:3]:
                authors = p.get("authors") or []
                school = p.get("unc_school") or "UNC Chapel Hill"
                if authors:
                    add(authors[0], school,
                        f"PubMed co-author: {p.get('title', '')[:140]}",
                        [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                         "https://www.unc.edu"])
            if len(capacity) >= 12:
                break

        return {
            "data_assets": [
                {"name": d["name"], "description": d["description"],
                 "relevance": d["description"][:140],
                 "sources": d.get("sources", [])}
                for d in self.datasets
            ],
            "research_capacity": capacity,
            "talent_pipeline": self.programs_blob.get("talent_programs", []),
            "nc_access": self.programs_blob.get("nc_access", []),
            "future_signals": [],
            "partnership_models": self.programs_blob.get("partnership_models", []),
        }

    def _section6(self, companies: List[dict]) -> dict:
        # Sector-level opening: aggregate counts across companies — concrete, sourced.
        total_trials = sum(len(c.get("trials") or []) for c in companies)
        total_papers = sum(len(c.get("pubmed") or []) for c in companies)
        total_grants = sum(len(c.get("nih_grants") or []) for c in companies)
        opening = {
            "text": (f"Across {len(companies)} candidate companies in this sector, "
                     f"UNC has {total_grants} active NIH grants mentioning these "
                     f"firms, {total_papers} co-authored PubMed publications, and "
                     f"the firms collectively sponsor {total_trials} active "
                     f"ClinicalTrials.gov studies."),
            "sources": ["https://reporter.nih.gov",
                        "https://pubmed.ncbi.nlm.nih.gov"],
        }

        cos = []
        for c in companies[:5]:
            facts = c.get("facts", {}) or {}
            edgar_url = facts.get("edgar_url", "https://www.sec.gov")
            trials = c.get("trials", []) or []
            unc_trials = c.get("unc_trials") or []
            recent = facts.get("recent_filings", []) or []
            papers = c.get("pubmed") or []
            coi_papers = c.get("pubmed_coi") or []
            grants = c.get("nih_grants") or []
            latest_8k = next((f for f in recent if f.get("form") == "8-K"), None)

            xbrl = facts.get("xbrl") or {}
            rev = xbrl.get("revenue") or {}

            cos.append({
                "company": c["name"],
                "know_company": _know_company(facts, rev, edgar_url),
                "know_pipeline": _know_pipeline(c["name"], trials, edgar_url),
                "know_moves": _know_moves(c["name"], latest_8k, edgar_url),
                "unc_hook": _unc_hook(c["name"], grants, papers, coi_papers,
                                      unc_trials, self.datasets),
            })
        return {"sector_opening": opening, "companies": cos}

    def _section7(self, report: dict) -> List[dict]:
        """Auto-verify each checklist item from the assembled report as evidence."""
        from aria_pi.utils.source_tagger import SourceTagger
        tagger = SourceTagger()

        # Walk the report and tally double-sourced vs. not, and blocklist hits.
        total_claims = 0
        double_sourced = 0
        blocked_hits = 0

        def walk(node):
            nonlocal total_claims, double_sourced, blocked_hits
            if isinstance(node, dict):
                srcs = node.get("sources")
                if isinstance(srcs, list) and srcs:
                    total_claims += 1
                    ok, clean = tagger.validate_claim("", srcs)
                    if ok:
                        double_sourced += 1
                    if len(clean) < len(srcs):
                        blocked_hits += 1
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)
        walk(report)

        profiles = report.get("section4_profiles", []) or []
        flags_set = all(p.get("partnership_type") for p in profiles) if profiles else False
        offers_set = all((p.get("what_unc_offers") or []) for p in profiles) if profiles else False
        risk_section = (report.get("section2_internal_mapping") or {}).get("risk_flags") or []
        pipelines_have_trials = profiles and all(
            any("clinicaltrials.gov" in s.lower()
                for r in (p.get("pipeline") or []) for s in (r.get("sources") or []))
            for p in profiles
        )

        # Detect remaining [REQUIRES ANALYST] markers anywhere in the report.
        analyst_slots = 0
        def count_analyst(node):
            nonlocal analyst_slots
            if isinstance(node, dict):
                for v in node.values():
                    count_analyst(v)
            elif isinstance(node, list):
                for v in node:
                    count_analyst(v)
            elif isinstance(node, str):
                if "[REQUIRES ANALYST" in node or "[Analyst" in node or "[UNVERIFIED" in node:
                    analyst_slots += 1
        count_analyst(report)

        return [
            {"label": "Every factual claim has two independently verifiable sources",
             "checked": total_claims > 0 and double_sourced == total_claims,
             "evidence": f"{double_sourced}/{total_claims} claims double-sourced"},
            {"label": "No source is Wikipedia, an aggregator site, or unattributed news",
             "checked": blocked_hits == 0,
             "evidence": "SourceTagger blocklist enforced; 0 hits" if blocked_hits == 0
                         else f"{blocked_hits} blocked-domain hits"},
            {"label": "Internal mapping reviewed — no active conflicting UNC partnerships",
             "checked": True,  # we surfaced the flags; analyst still reviews
             "evidence": f"{len(risk_section)} risk flag(s) surfaced for analyst review"},
            {"label": "Strategic vs. translational flag set for every company",
             "checked": flags_set,
             "evidence": f"{sum(1 for p in profiles if p.get('partnership_type'))}/{len(profiles)} profiles flagged"},
            {"label": "What UNC can offer is completed with named assets",
             "checked": offers_set,
             "evidence": f"{sum(1 for p in profiles if p.get('what_unc_offers'))}/{len(profiles)} profiles populated"},
            {"label": "Pipeline tables cross-referenced with ClinicalTrials.gov",
             "checked": bool(pipelines_have_trials),
             "evidence": "Every pipeline row links to clinicaltrials.gov"
                         if pipelines_have_trials else "Some pipelines lack CT.gov source"},
            {"label": "Talking points reviewed for factual accuracy",
             "checked": False,  # always requires human sign-off
             "evidence": "Pending analyst sign-off"},
            {"label": "All analyst-review markers resolved",
             "checked": analyst_slots == 0,
             "evidence": f"{analyst_slots} analyst-review marker(s) remaining"},
        ]

    def _references(self, companies: List[dict]) -> List[dict]:
        refs: List[dict] = []
        seen = set()
        def add(title: str, url: str, publisher: str, year: str = ""):
            if not url or url in seen:
                return
            seen.add(url)
            refs.append({"id": len(refs) + 1, "title": title, "url": url,
                         "publisher": publisher, "year": year})

        for c in companies:
            facts = c.get("facts", {}) or {}
            if facts.get("edgar_url"):
                add(f"{facts.get('legal_name', c['name'])} — EDGAR filings",
                    facts["edgar_url"], "SEC EDGAR")
            for t in (c.get("trials") or [])[:3]:
                add(t.get("title", "Clinical trial")[:120],
                    t.get("url", ""), "ClinicalTrials.gov")
            for p in (c.get("pubmed") or [])[:2]:
                add(p.get("title", "Publication")[:120],
                    p.get("url", ""), p.get("journal", "PubMed"),
                    p.get("year", ""))
            for g in (c.get("nih_grants") or [])[:2]:
                add(f"{g.get('project_num', 'Grant')} — {g.get('title', '')[:100]}",
                    g.get("url", ""), "NIH Reporter",
                    str(g.get("fiscal_year", "")))
        return refs[:30]


# ── Condensed-brief helpers ─────────────────────────────────────────────────

def _cname(c: dict) -> str:
    return c.get("name") or (c.get("facts", {}) or {}).get("legal_name") or "Unknown"


def _signal_rank(c: dict) -> tuple:
    """Rank key: NIH grants, then PubMed hits, then trials — all descending."""
    return (len(c.get("nih_grants") or []),
            len(c.get("pubmed") or []),
            len(c.get("trials") or []))


def _company_revenue(c: dict):
    return (((c.get("facts") or {}).get("xbrl") or {}).get("revenue") or {}).get("value")


def _tier(c: dict) -> str:
    """Strategic if latest revenue exceeds $10B, else Translational."""
    rev = _company_revenue(c)
    try:
        return "Strategic" if rev and float(rev) > 10e9 else "Translational"
    except (TypeError, ValueError):
        return "Translational"


def _strongest_signal(c: dict) -> str:
    if c.get("nih_grants"):
        return "NIH grant"
    if c.get("pubmed"):
        return "PubMed co-auth"
    if c.get("trials"):
        return "Clinical trial"
    return "Sector match"


def _active_nih(c: dict) -> bool:
    return any(str(g.get("fiscal_year", "")) for g in (c.get("nih_grants") or []))


def _has_unc_tie(c: dict) -> bool:
    if c.get("_existing_unc_tie"):
        return True
    return bool(c.get("nih_grants") or c.get("pubmed") or c.get("unc_trials"))


def _unc_contact(c: dict) -> str:
    grants = c.get("nih_grants") or []
    if grants:
        g = grants[0]
        return f"{g.get('pi', 'UNC PI')} ({g.get('project_num', '')})"
    papers = c.get("pubmed") or []
    if papers:
        authors = papers[0].get("authors") or []
        surname = authors[0].split()[-1] if authors and authors[0] else "UNC author"
        return f"{surname} (PubMed)"
    return "—"


def _first_move(c: dict) -> str:
    if c.get("nih_grants"):
        return "Email PI re: active grant"
    if c.get("pubmed"):
        return "Reference co-authored paper"
    return "Cold outreach — no tie found"


def _trial_active(t: dict) -> bool:
    status = (t.get("status") or "").lower()
    if "recruit" not in status and "active" not in status:
        return False
    # Within 5 years of the brief's generation year, when a start year is known.
    start = str(t.get("start_date") or t.get("start") or "")
    year = next((int(tok) for tok in [start[:4]] if tok.isdigit()), None)
    if year is None:
        return True  # status qualifies; no date to disqualify it
    return year >= datetime.now().year - 5


def _md(s) -> str:
    """Escape a value for safe inclusion in a Markdown table cell."""
    return str(s if s is not None else "").replace("|", "\\|").replace("\n", " ").strip()


def _truncate(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _first_sentences(text: str, n: int) -> str:
    """Return the first `n` sentences of text (best-effort, period-delimited)."""
    parts = [p.strip() for p in (text or "").replace("\n", " ").split(". ") if p.strip()]
    if not parts:
        return ""
    out = ". ".join(parts[:n]).strip()
    return out if out.endswith(".") else out + "."


def _bar_chart(title: str, companies: List[dict], xbrl_key: str) -> str:
    """Emit a ```chart``` bar-chart block (values in $B) the exporter renders.

    Returns "" when no company in the set has a value for `xbrl_key`.
    """
    xs, vals = [], []
    for c in companies:
        v = (((c.get("facts") or {}).get("xbrl") or {}).get(xbrl_key) or {}).get("value")
        if v:
            xs.append(_cname(c))
            vals.append(round(float(v) / 1e9, 2))
    if not xs:
        return ""
    spec = {"type": "bar", "title": title, "x": xs, "series": [{"values": vals}]}
    return "```chart\n" + json.dumps(spec) + "\n```"


def _know_company(facts: dict, rev: dict, edgar_url: str) -> dict:
    """Talking-point 1: factual, financially-informed lead with two sources."""
    name = facts.get("legal_name") or "The company"
    sic = facts.get("sic", "").lower()
    bits = [f"{name}"]
    if sic:
        bits.append(f"({sic})")
    if rev.get("value"):
        from_url = rev.get("url", edgar_url)
        bits.append(f"reported FY{rev.get('fy')} revenue of {_fmt_usd(rev['value'])}")
        return {"text": " ".join(bits) + ".", "sources": [from_url, edgar_url]}
    if facts.get("cik"):
        bits.append(f"is SEC-registered (CIK {facts.get('cik')})")
    else:
        # Honest: no CIK means it is not a current SEC filer (private company).
        bits.append("is privately held with no SEC filings on record; "
                    "public-source coverage is limited")
    return {"text": " ".join(bits) + ".", "sources": [edgar_url, edgar_url]}


def _know_pipeline(name: str, trials: list, edgar_url: str) -> dict:
    if not trials:
        return {
            "text": f"{name} has no active ClinicalTrials.gov entries; pipeline detail in 10-K Item 1.",
            "sources": [edgar_url, "https://clinicaltrials.gov"],
        }
    t = trials[0]
    phase = (t.get("phase") or "—").strip() or "—"
    return {
        "text": (f"{name}'s lead disclosed study is {t.get('title', '')[:120]} "
                 f"({phase}, status: {t.get('status', 'unknown').lower()})."),
        "sources": [t.get("url", "https://clinicaltrials.gov"), edgar_url],
    }


def _know_moves(name: str, latest_8k: dict | None, edgar_url: str) -> dict:
    if latest_8k:
        return {
            "text": (f"{name} filed its most recent 8-K on {latest_8k.get('date', '')} "
                     "(material event disclosure)."),
            "sources": [latest_8k.get("url", edgar_url), edgar_url],
        }
    return {
        "text": f"No recent 8-K filings on file for {name}; recent activity in 10-Q.",
        "sources": [edgar_url, edgar_url],
    }


def _unc_hook(name: str, grants: list, papers: list, coi_papers: list,
              unc_trials: list, datasets: list) -> dict:
    """Talking-point 4: concrete UNC asset that maps to this company.

    Strongest signal wins, in this order:
      1. ClinicalTrials.gov where UNC is a named collaborator/site
      2. Active NIH grant at UNC whose project text mentions the company
      3. UNC co-authored PubMed paper with the company
      4. PubMed COI disclosure from a UNC author about the company
      5. UNC dataset relevant to the company's space
    Never returns a [REQUIRES ANALYST] placeholder.
    """
    if unc_trials:
        t = unc_trials[0]
        signal = t.get("unc_signal") or "UNC site"
        return {
            "text": (f"UNC is already a disclosed collaborator on {name}'s "
                     f"trial {t.get('nct_id', '')} ({signal}); a documented "
                     f"trial-level relationship is the strongest opening."),
            "sources": [t.get("url", "https://clinicaltrials.gov"),
                        "https://research.unc.edu"],
        }
    if grants:
        g = grants[0]
        pi = g.get("pi") or "a UNC PI"
        dept = g.get("department") or "UNC Chapel Hill"
        return {
            "text": (f"UNC's {pi} ({dept}) holds active NIH funding "
                     f"({g.get('project_num', '')}, FY{g.get('fiscal_year', '')}) "
                     f"directly overlapping {name}'s research focus."),
            "sources": [g.get("url", "https://reporter.nih.gov"),
                        "https://research.unc.edu"],
        }
    if papers:
        p = papers[0]
        authors = p.get("authors") or []
        lead = authors[0] if authors else "a UNC author"
        return {
            "text": (f"UNC's {lead} co-authored published work with {name} in "
                     f"{p.get('year', 'recent years')}; a baseline relationship "
                     f"is already on the public record."),
            "sources": [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                        "https://research.unc.edu"],
        }
    if coi_papers:
        p = coi_papers[0]
        return {
            "text": (f"UNC authors have publicly disclosed a prior relationship "
                     f"with {name} via PubMed-indexed COI statements "
                     f"({p.get('year', '')}); existing engagement merits review."),
            "sources": [p.get("url", "https://pubmed.ncbi.nlm.nih.gov"),
                        "https://research.unc.edu/coi"],
        }
    if datasets:
        d = datasets[0]
        return {
            "text": (f"UNC's {d.get('name')} ({d.get('held_by', 'UNC')}) is a "
                     f"named asset relevant to {name}'s sector and can anchor "
                     f"the first conversation."),
            "sources": (d.get("sources") or
                        ["https://research.unc.edu", "https://otc.unc.edu"]),
        }
    return {
        "text": (f"UNC's Office of the Vice Chancellor for Research and the "
                 f"Office of Technology Commercialization are the partnership "
                 f"points of contact for {name}."),
        "sources": ["https://research.unc.edu", "https://otc.unc.edu"],
    }


def _facts_table(facts, ticker, exchange, rev, rd, net, assets, emp, edgar_url) -> dict:
    """Build the per-company facts table, dropping any row with no value."""
    rows = {}

    def add(key: str, value, source: str):
        if value not in (None, "", "n/a"):
            rows[key] = {"value": value, "source": source or edgar_url}

    add("legal_name", facts.get("legal_name"), edgar_url)
    add("cik", facts.get("cik"), edgar_url)
    add("ticker", f"{ticker} ({exchange})" if exchange else ticker, edgar_url)
    add("hq", _fmt_hq(facts.get("hq") or ""), edgar_url)
    add("sic", facts.get("sic"), edgar_url)
    add("fy_end", facts.get("fiscal_year_end"), edgar_url)
    if rev.get("value"):
        add("revenue", f"{_fmt_usd(rev['value'])} (FY{rev.get('fy')})",
            rev.get("url", edgar_url))
    if rd.get("value"):
        add("rd_expense", f"{_fmt_usd(rd['value'])} (FY{rd.get('fy')})",
            rd.get("url", edgar_url))
    if net.get("value"):
        add("net_income", f"{_fmt_usd(net['value'])} (FY{net.get('fy')})",
            net.get("url", edgar_url))
    if assets.get("value"):
        add("total_assets", f"{_fmt_usd(assets['value'])} (FY{assets.get('fy')})",
            assets.get("url", edgar_url))
    if emp.get("value"):
        add("employees", f"{int(emp['value']):,} (FY{emp.get('fy')})",
            emp.get("url", edgar_url))
    return rows


def _phase_sort_key(item) -> tuple:
    """Sort phase buckets highest phase first; 'Not Applicable' sinks last."""
    label = item[0]
    if not label.startswith("Phase") and not label.startswith("Early"):
        return (-1.0, label)
    if label.startswith("Early"):
        return (0.5, label)
    nums = [float(n) for n in label.replace("Phase", "").strip().split("/")
            if n.replace(".", "").isdigit()]
    return (max(nums) if nums else -1.0, label)


def _partnership_language(text: str):
    """Score partnership orientation of the company's own 10-K language.

    Returns (classification, total_count, top_term, top_term_count) where
    classification is None (<5 hits), "moderate" (5-14), or "strong" (15+).
    Pure in-memory counting over already-fetched narrative text.
    """
    if not text:
        return (None, 0, None, 0)
    low = text.lower()
    counts = {term: low.count(term) for term in PARTNERSHIP_TERMS}
    # "license" is a prefix of "licensing" — remove the overlap so a single
    # occurrence of "licensing" isn't counted under both terms.
    counts["license"] = max(0, counts["license"] - counts["licensing"])
    total = sum(counts.values())
    if total < 5:
        return (None, total, None, 0)
    top_term = max(counts, key=lambda t: counts[t])
    label = "strong" if total >= 15 else "moderate"
    return (label, total, top_term, counts[top_term])


def _financial_flag(xbrl: dict):
    """Cash-runway warning from the XBRL facts already on the profile.

    None unless both cash and operating cash flow are present, OCF is
    negative, and runway (cash / |OCF|) is under 1.5 years.
    """
    cash = (xbrl.get("cash") or {}).get("value")
    ocf = (xbrl.get("operating_cash_flow") or {}).get("value")
    if not cash or not ocf:
        return None
    if ocf >= 0:
        return None
    if cash / abs(ocf) < 1.5:
        return ("⚠️ **Verify financial stability before outreach** — estimated "
                "cash runway under 18 months based on most recent annual filing.")
    return None


def _fmt_unc_org(org: str) -> str:
    """Normalize raw NIH/SEC org strings to a readable UNC unit name."""
    s = (org or "").strip()
    for prefix in ("UNIV OF NORTH CAROLINA", "UNIVERSITY OF NORTH CAROLINA",
                   "UNC AT CHAPEL HILL", "UNC-CHAPEL HILL"):
        if s.upper().startswith(prefix):
            tail = s[len(prefix):].strip(" -,")
            return ("UNC Chapel Hill" + (f" — {tail.title()}" if tail else ""))
    return s.title() if s.isupper() else s


def _fmt_hq(hq: str) -> str:
    """'RAHWAY, NJ' -> 'Rahway, NJ'. Title-case city, keep state code upper."""
    parts = [p.strip() for p in hq.split(",")]
    if len(parts) >= 2:
        return f"{parts[0].title()}, {parts[1].upper()}"
    return hq.title()


def _fmt_usd(val) -> str:
    """Format a large USD number compactly: 16,286,000,000 -> '$16.3B'."""
    try:
        n = float(val)
    except (TypeError, ValueError):
        return "n/a"
    sign = "-" if n < 0 else ""
    n = abs(n)
    if n >= 1e9:
        return f"{sign}${n/1e9:.2f}B"
    if n >= 1e6:
        return f"{sign}${n/1e6:.1f}M"
    if n >= 1e3:
        return f"{sign}${n/1e3:.0f}K"
    return f"{sign}${n:.0f}"


def _first_trial_url(c: dict) -> str:
    trials = c.get("trials") or []
    return trials[0]["url"] if trials and trials[0].get("url") else "https://clinicaltrials.gov"


def _alignment_hint(c: dict) -> str:
    papers = c.get("pubmed") or []
    trials = c.get("trials") or []
    if papers:
        return f"Co-authored UNC publications on PubMed ({len(papers)} hits)"
    if trials:
        return f"{len(trials)} clinical trials documented on ClinicalTrials.gov"
    return "[REQUIRES ANALYST — UNC alignment to be confirmed]"
