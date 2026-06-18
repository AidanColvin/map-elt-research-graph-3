"""ARIA-PI Orchestrator — free, no API keys.

Flow per request:
  1. Pick seed companies for the sector (curated list).
  2. Fetch real, citable data per company from free public APIs:
       • SEC EDGAR submissions  (facts + recent filings)
       • ClinicalTrials.gov v2  (pipeline)
       • PubMed (Entrez)        (UNC alignment / co-authorship)
  3. Hand to the deterministic ReportBuilder which assembles the
     7-section report using real URLs as sources.
  4. Validate sources against the blocklist (no Wikipedia / aggregators).
  5. Return the report.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, conlist, constr
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeout
import json
import logging
import os
import time
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)s}',
)
_log = logging.getLogger("aria_pi")

from aria_pi.clients.clinicaltrials_client import ClinicalTrialsClient
from aria_pi.clients.sec_edgar_client import SECEdgarClient
from aria_pi.clients.pubmed_client import PubMedClient
from aria_pi.clients.nih_reporter_client import NIHReporterClient
from aria_pi.clients.patents import fetch_patents, EMPTY as EMPTY_PATENTS
from aria_pi.builders.report_builder import ReportBuilder
from aria_pi.utils.source_tagger import SourceTagger
from aria_pi.sectors import (
    seeds_for as _seeds_for,
    canonical_sector,
    SECTOR_SEEDS,
    SECTOR_NC_SEEDS,
    DEFAULT_SEEDS,
)


# Error monitoring (Sentry). No-op unless SENTRY_DSN is set, so local/dev and
# unconfigured deploys run identically with zero overhead. Imported lazily so a
# missing package never breaks startup.
_sentry_dsn = os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=_sentry_dsn,
            traces_sample_rate=0.1,
            send_default_pii=False,
            environment=os.environ.get("VERCEL_ENV", "development"),
        )
    except Exception:  # pragma: no cover - monitoring must never block startup
        logging.getLogger(__name__).warning("Sentry init skipped", exc_info=True)

app = FastAPI(title="ARIA-PI Orchestrator", version="0.3.0")

# The browser never calls this API directly — the Next.js app talks to it
# server-side through its own /api proxy — so we restrict CORS to the known
# frontend origins instead of "*". No credentials are ever used (the API is
# keyless public-data), so allow_credentials stays False: a wildcard origin
# combined with credentials is exactly the misconfiguration we avoid here.
_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://map-omega-azure.vercel.app,http://localhost:3000",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


# Length/size caps stop a single request from forcing a huge fan-out or an
# oversized payload. Pydantic raises a 422 automatically when these are exceeded.
_Sector = constr(strip_whitespace=True, min_length=1, max_length=200)
_Company = constr(strip_whitespace=True, min_length=1, max_length=120)


class PipelineRequest(BaseModel):
    sector: _Sector
    companies: Optional[conlist(_Company, max_length=25)] = None
    company_override: Optional[constr(max_length=120)] = None  # legacy


class PartnershipRequest(BaseModel):
    query: _Sector
    type: str = "company"  # "company" | "sector"


@app.get("/")
async def root():
    return {"service": "ARIA-PI", "version": "0.3.0",
            "endpoints": ["/status", "/run-pipeline"]}


@app.get("/status")
async def get_status():
    return {
        "status": "online",
        "mode": "free — no API keys required",
        "data_sources": ["SEC EDGAR", "ClinicalTrials.gov", "PubMed (Entrez)"],
    }


@app.post("/run-pipeline")
async def run_pipeline(req: PipelineRequest):
    try:
        sec = SECEdgarClient()
        trials = ClinicalTrialsClient()
        tagger = SourceTagger()
        builder = ReportBuilder()
        pubmed = PubMedClient()
        nih = NIHReporterClient()

        override = req.companies or ([req.company_override] if req.company_override else None)
        seeds, resolution = _resolve_seeds(req.sector, override, sec)
        _log.info("pipeline: sector=%r seeds=%d resolution=%s",
                  req.sector, len(seeds), resolution)

        # 1. Real data collection per company — runs all sources in parallel
        # for up to 10 candidate companies within the Vercel 60s budget.
        _t0 = time.monotonic()
        company_data = _fetch_all_concurrent(
            seeds[:22], sec=sec, trials=trials, pubmed=pubmed, nih=nih
        )
        _log.info("pipeline: fetch done in %.1fs companies=%d",
                  time.monotonic() - _t0, len(company_data))

        # 2. Deterministic synthesis
        report = builder.build(req.sector, {"sector": req.sector, "companies": company_data})

        # 3. Source-blocklist validation
        report["_validation"] = _validate_report_sources(report, tagger)
        _val = report["_validation"]
        _log.info("pipeline: validation total=%d verified=%d unverified=%d",
                  _val["total_claims"], _val["verified"], _val["unverified"])

        # 3b. Condensed 18–22 page brief (Markdown) alongside the full report.
        report["condensed_report_markdown"] = builder.build_condensed_report(report, company_data)
        report["_meta"] = {
            "mode": "free",
            "seed_companies": seeds[:10],
            "resolution": resolution,  # "curated" | "discovered" | "override" | "default"
            "pubmed_enabled": bool(pubmed),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }

        payload = {"sector": req.sector, "status": "COMPLETED", "data": report}
        return JSONResponse(
            content=payload,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    except Exception as e:
        _log.exception("run_pipeline failed: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail="Internal error while generating the report.")


@app.post("/api/partnerships")
async def partnerships(req: PartnershipRequest):
    """Resolve verifiable UNC ↔ company/sector partnership evidence.

    Accepts { query, type } and returns source-linked clinical (PubMed),
    financial (verbatim SEC text), and university-ecosystem (unc.edu) data.
    No AI summaries — every fact carries its primary source.
    """
    try:
        from aria_pi.clients.partnership_resolver import resolve_partnerships
        kind = req.type if req.type in ("company", "sector") else "company"
        data = resolve_partnerships(req.query, kind)
        return JSONResponse(
            content={"status": "COMPLETED", "data": data},
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
    except Exception as e:
        _log.exception("partnerships failed: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail="Internal error while generating the report.")


def _sse(obj: dict) -> str:
    """Format one object as a Server-Sent Events `data:` frame."""
    return f"data: {json.dumps(obj)}\n\n"


@app.post("/run-pipeline-stream")
async def run_pipeline_stream(req: PipelineRequest):
    """Same pipeline as /run-pipeline, but streams real progress events.

    Emits SSE frames so the frontend can tie its progress UI to genuine
    backend work rather than a timer:
      • {type:"stage", key:"resolved", total:N}  — company list resolved
      • {type:"progress", done:k, total:N, company:"…"}  — each company done
      • {type:"stage", key:"building"}            — assembling the report
      • {type:"stage", key:"verifying"}           — source validation
      • {type:"done", report:{…}}                 — finished report payload
      • {type:"error", message:"…"}               — failure (frontend falls back)
    """
    def gen():
        try:
            sec = SECEdgarClient()
            trials = ClinicalTrialsClient()
            tagger = SourceTagger()
            builder = ReportBuilder()
            pubmed = PubMedClient()
            nih = NIHReporterClient()

            override = req.companies or ([req.company_override] if req.company_override else None)
            seeds, resolution = _resolve_seeds(req.sector, override, sec)
            _log.info("pipeline-stream: sector=%r seeds=%d resolution=%s",
                      req.sector, len(seeds), resolution)
            seeds = seeds[:22]
            total = len(seeds)
            yield _sse({"type": "stage", "key": "resolved",
                        "total": total, "resolution": resolution})

            # Fetch every company concurrently, emitting a progress frame as
            # each one finishes — this is the genuine, granular signal that
            # drives the frontend progress bar.
            t_start = time.monotonic()
            # Prefetch SEC facts for all companies so financials survive a later
            # enrichment-deadline cutoff; the prefetch eats into the budget.
            facts_by_name = _prefetch_facts(seeds, sec,
                                            deadline=t_start + FACTS_PREFETCH_BUDGET)
            out_by_name = {n: _empty_company(n, facts_by_name.get(n)) for n in seeds}
            done = 0
            stream_timeout = max(1.0, t_start + FETCH_BUDGET_SECONDS - time.monotonic())
            with ThreadPoolExecutor(max_workers=len(seeds)) as pool:
                fut_to_name = {
                    pool.submit(_fetch_one_company, n, sec=sec, trials=trials,
                                pubmed=pubmed, nih=nih,
                                prefetched_facts=facts_by_name.get(n)): n
                    for n in seeds
                }
                try:
                    for fut in as_completed(fut_to_name,
                                            timeout=stream_timeout + 2):
                        name = fut_to_name[fut]
                        try:
                            out_by_name[name] = fut.result(timeout=0.1)
                        except Exception as e:
                            _log.warning("stream company err %s: %s", name, e)
                        done += 1
                        yield _sse({"type": "progress", "done": done,
                                    "total": total, "company": name})
                except FuturesTimeout:
                    # Deadline hit — remaining companies keep their SEC-only stubs.
                    _log.warning("stream fetch deadline reached")

            company_data = [out_by_name[n] for n in seeds]

            yield _sse({"type": "stage", "key": "building"})
            report = builder.build(req.sector,
                                   {"sector": req.sector, "companies": company_data})

            yield _sse({"type": "stage", "key": "verifying"})
            report["_validation"] = _validate_report_sources(report, tagger)
            report["condensed_report_markdown"] = builder.build_condensed_report(
                report, company_data)
            report["_meta"] = {
                "mode": "free",
                "seed_companies": seeds,
                "resolution": resolution,
                "pubmed_enabled": bool(pubmed),
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            }

            yield _sse({"type": "done", "report": report})
        except Exception as e:
            _log.exception("run_pipeline_stream failed: %s", type(e).__name__)
            yield _sse({"type": "error", "message": "Internal error while generating the report."})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            # Disable proxy buffering so frames flush as they're produced.
            "X-Accel-Buffering": "no",
        },
    )


# Wall-clock budget for the entire data-collection phase. Vercel Hobby caps
# serverless functions at 60s; we reserve the remainder for report assembly +
# cold-start margin. Whatever data has returned by the deadline is used as-is —
# the ReportBuilder derives a complete, sector-specific report from partial
# data (SEC EDGAR is the fast, reliable backbone; PubMed/NIH/Trials enrich it).
FETCH_BUDGET_SECONDS = 44

# The SEC-facts prefetch runs first and eats into (not on top of) the overall
# FETCH_BUDGET_SECONDS data-phase budget, so the total stays within the 60s
# Vercel function limit with margin for report assembly.
FACTS_PREFETCH_BUDGET = 15


def _resolve_seeds(sector: str, override, sec) -> tuple[List[str], str]:
    """Decide which companies a report covers, in priority order:

      1. override    — caller passed explicit companies.
      2. curated      — the sector maps to one of our 24 canonical sectors,
                        which have hand-picked top-15 global lists plus
                        NC-specific companies appended at the end.
      3. discovered   — ANY other free-text term ("pasta", "video games"):
                        pull real, currently-traded companies live from SEC
                        EDGAR full-text search.
      4. default      — only if SEC discovery returns nothing.
    """
    if override:
        return list(override), "override"
    canon = canonical_sector(sector)
    if canon and canon in SECTOR_SEEDS:
        global_seeds = SECTOR_SEEDS[canon]
        # Append NC-specific companies that aren't already in the global list.
        nc_extras = [c for c in SECTOR_NC_SEEDS.get(canon, [])
                     if c not in global_seeds]
        return global_seeds + nc_extras, "curated"
    try:
        discovered = sec.discover_companies(sector, limit=15)
    except Exception as e:
        _log.warning("discovery failed for %s: %s", sector, e)
        discovered = []
    if discovered:
        return discovered, "discovered"
    return DEFAULT_SEEDS, "default"


def _empty_company(name: str, facts: dict | None = None) -> dict:
    """A partial-data company record. When `facts` is supplied (from the SEC
    facts prefetch) the stub carries real financials/CIK, so a company whose
    slow enrichment misses the deadline still renders its SEC numbers instead of
    being shown as private with blank financials. `_sec_only_stub` stays True so
    the UI shows its "Partial data — only SEC EDGAR facts" banner."""
    return {"name": name,
            "facts": facts or {"legal_name": name, "source": "https://www.sec.gov"},
            "trials": [], "unc_trials": [], "pubmed": [], "pubmed_coi": [],
            "nih_grants": [], "unc_alumni": [],
            "patents": dict(EMPTY_PATENTS), "collab_8ks": {}, "tenk_text": "",
            "_sec_only_stub": True}


def _safe_facts(sec, name: str) -> dict:
    """get_company_facts for one company, never raising."""
    try:
        return sec.get_company_facts(name)
    except Exception as e:
        _log.warning("facts prefetch failed for %s: %s", name, e)
        return {"legal_name": name, "source": "https://www.sec.gov"}


def _prefetch_facts(names: List[str], sec, deadline: float) -> dict:
    """Fetch SEC facts (CIK + financials) for every company up front, concurrently.

    This is the cheap, high-value part of each company's data (2-3 SEC GETs,
    now rate-limited process-wide). Fetching it separately and seeding it into
    every company's stub guarantees financials survive even when the slower
    enrichment (10-K text, website scrape, 8-Ks) blows the deadline. Bounded by
    `deadline`; any company not back in time simply has no prefetched facts and
    falls through to the per-company fetch.
    """
    out: dict = {}
    if not names:
        return out
    with ThreadPoolExecutor(max_workers=min(len(names), 8)) as pool:
        fut_to_name = {pool.submit(_safe_facts, sec, n): n for n in names}
        for fut, name in fut_to_name.items():
            remaining = deadline - time.monotonic()
            try:
                out[name] = fut.result(timeout=max(0.1, remaining))
            except Exception as e:
                _log.warning("facts prefetch deadline for %s: %s", name, e)
    return out


def _fetch_one_company(name: str, sec, trials, pubmed, nih,
                       prefetched_facts: dict | None = None) -> dict:
    """Run the data-source lookups for one company in parallel.

    PubMed is deliberately limited to ONE combined query (was 7+ per company)
    because the unauthenticated E-utilities endpoint rate-limits to ~3 req/s
    and the school-by-school + COI fan-out was the dominant cause of timeouts.

    When `prefetched_facts` is supplied, the SEC facts call is skipped (the
    caller already fetched them up front), so this spends its whole budget on
    the slower enrichment sources.
    """
    def safe(fn, label, default):
        try:
            return fn()
        except Exception as e:
            _log.warning("%s failed for %s: %s", label, name, e)
            return default

    defaults = {
        "facts": {"legal_name": name, "source": "https://www.sec.gov"},
        "trials": [], "pubmed": [], "nih_grants": [],
        "patents": dict(EMPTY_PATENTS),
    }
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {
            "trials": pool.submit(safe,
                lambda: trials.search_by_sponsor(name), "Trials", []),
            "pubmed": pool.submit(safe,
                lambda: pubmed.search_unc_with_company(name, max_results=8),
                "PubMed", []),
            "nih_grants": pool.submit(safe,
                lambda: nih.unc_grants_mentioning(name, max_results=8),
                "NIH Reporter", []),
            "patents": pool.submit(safe,
                lambda: fetch_patents(name), "Patents", defaults["patents"]),
        }
        # Only fetch SEC facts here if they weren't prefetched by the caller.
        if prefetched_facts is None:
            futures["facts"] = pool.submit(safe,
                lambda: sec.get_company_facts(name), "SEC", defaults["facts"])
        results = {}
        for k, f in futures.items():
            try:
                results[k] = f.result(timeout=FETCH_BUDGET_SECONDS)
            except Exception as e:
                _log.warning("%s timed out for %s: %s", k, name, e)
                results[k] = defaults[k]
    if prefetched_facts is not None:
        results["facts"] = prefetched_facts

    # COI disclosures run sequentially — NOT inside the pool above — so the
    # process-wide NCBI throttle can enforce the 0.35s gap after the main
    # PubMed query, keeping the keyless E-utilities endpoint under its limit.
    pubmed_coi = safe(
        lambda: pubmed.search_coi_disclosures(name, max_results=4),
        "PubMed-COI", [],
    )

    company_trials = results["trials"] or []
    unc_trials = [t for t in company_trials if t.get("unc_signal")]

    # Alumni fetch — two sources merged:
    #   1. SEC DEF 14A proxy (public companies only, covers board + NEOs)
    #   2. Company website bio page (all companies, especially private ones)
    cik = str(results["facts"].get("cik") or "")
    website_url = str(results["facts"].get("website") or "")
    proxy_filings = (results["facts"].get("filings_by_form") or {}).get("DEF 14A", [])

    proxy_alumni = safe(
        lambda: sec.get_unc_alumni_from_proxy(cik, proxy_filings),
        "Alumni-proxy", [],
    ) if cik and proxy_filings else []

    web_alumni = safe(
        lambda: sec.get_unc_alumni_from_website(name, website_url),
        "Alumni-web", [],
    )

    # CIK-dependent enrichment runs after facts, like the alumni fetches:
    # 8-K collaboration track record + latest 10-K narrative text.
    collab_8ks = safe(
        lambda: sec.fetch_collaboration_8ks(cik), "Collab-8K", {},
    ) if cik else {}
    tenk_text = safe(
        lambda: sec.get_tenk_text(
            cik, results["facts"].get("filings_by_form") or {}),
        "10-K text", "",
    ) if cik else ""

    # Merge, deduplicating by lowercased name
    seen_names: set = {p["name"].lower().strip() for p in proxy_alumni}
    merged = list(proxy_alumni)
    for p in web_alumni:
        key = p["name"].lower().strip()
        if key and key not in seen_names:
            seen_names.add(key)
            merged.append(p)
    unc_alumni = merged[:8]

    return {
        "name": name,
        "facts": results["facts"],
        "trials": company_trials[:12],
        "unc_trials": unc_trials,
        "pubmed": results["pubmed"],
        "pubmed_coi": pubmed_coi,
        "nih_grants": results["nih_grants"],
        "unc_alumni": unc_alumni,
        "patents": results["patents"] or dict(EMPTY_PATENTS),
        "collab_8ks": collab_8ks or {},
        "tenk_text": tenk_text or "",
        "_sec_only_stub": False,
    }


def _fetch_all_concurrent(names: List[str], **clients) -> List[dict]:
    """Fetch data for every named company concurrently within a hard deadline.

    The total wait can never exceed FETCH_BUDGET_SECONDS: any company whose
    data has not returned by the deadline is filled with an SEC-only stub so
    the report still renders. This is what makes the endpoint reliable for
    every sector inside the serverless time limit.
    """
    if not names:
        return []
    t_start = time.monotonic()
    # Prefetch SEC facts (financials + CIK) for all companies first, so they
    # survive even if a company's enrichment later misses the deadline. The
    # prefetch eats into the shared budget — enrichment uses the remainder.
    facts_by_name = _prefetch_facts(names, clients["sec"],
                                    deadline=t_start + FACTS_PREFETCH_BUDGET)
    out_by_name: dict[str, dict] = {
        n: _empty_company(n, facts_by_name.get(n)) for n in names
    }
    deadline = t_start + FETCH_BUDGET_SECONDS
    with ThreadPoolExecutor(max_workers=min(len(names), 7)) as pool:
        future_to_name = {
            pool.submit(_fetch_one_company, n,
                        prefetched_facts=facts_by_name.get(n), **clients): n
            for n in names
        }
        for fut, name in future_to_name.items():
            remaining = deadline - time.monotonic()
            try:
                out_by_name[name] = fut.result(timeout=max(0.1, remaining))
            except Exception as e:
                _log.warning("Company fetch deadline/err for %s: %s", name, e)
                # keep the facts-bearing SEC stub already in out_by_name
    return [out_by_name[n] for n in names]


def _validate_report_sources(report: dict, tagger: SourceTagger) -> dict:
    issues: List[dict] = []
    valid = 0
    total = 0

    def visit(node, path="root"):
        nonlocal valid, total
        if isinstance(node, dict):
            srcs = node.get("sources")
            if isinstance(srcs, list) and srcs:
                total += 1
                ok, clean = tagger.validate_claim("", srcs)
                if ok:
                    valid += 1
                else:
                    issues.append({"path": path, "sources": srcs,
                                   "reason": f"Only {len(clean)} valid sources"})
            for k, v in node.items():
                visit(v, f"{path}.{k}")
        elif isinstance(node, list):
            for i, item in enumerate(node):
                visit(item, f"{path}[{i}]")

    visit(report)
    return {"total_claims": total, "verified": valid,
            "unverified": total - valid, "issues": issues[:20]}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
