# Map

**One program, two intelligence engines — completely free to run.**

> **No language model in the request path. No API keys. No per-use cost.**
> Every number, sentence, and citation traces to a free, keyless public data source.

Map merges two previously separate programs into a single web application:

| Engine | Route | What it does |
|---|---|---|
| **Company Deep Dive** (from *company-intelligence-reports*) | `/deep-dive` | Board-ready intelligence reports on any public company — live financials from SEC EDGAR XBRL, the company's own 10-K narrative, leadership org charts, and streamed charts. |
| **Sector Scan** (from *sector-scan-reports* / ARIA-PI) | `/sector-scan` | Search any sector and get a fully sourced report mapping public companies to overlapping research at UNC Chapel Hill — scored and citation-checked. |

---

## Repository layout

```
map/                            ← the merged program (Next.js frontend + API routes)
│   ├── app/
│   │   ├── page.tsx            ← "Map" landing page linking both engines
│   │   ├── deep-dive/          ← Company Deep Dive UI
│   │   ├── sector-scan/        ← Sector Scan UI
│   │   ├── api/generate/       ← deep-dive report engine (runs IN the frontend)
│   │   ├── api/run-pipeline/   ← proxy → Python backend (full report)
│   │   ├── api/run-pipeline-stream/ ← proxy → Python backend (SSE progress)
│   │   └── components/         ← deep-dive components (charts, markdown, logo)
│   ├── components/             ← sector-scan components (Report, Excel, Slides…)
│   ├── lib/                    ← both engines' libraries (no name collisions)
│   └── content/reports/        ← 7 hand-curated company deep dives (markdown)
backend/                        ← Sector Scan FastAPI backend (Python, ARIA-PI)
│   ├── api/index.py            ← Vercel serverless entry point
│   └── aria_pi/                ← orchestrator, data clients, report builder
company-intelligence-reports/   ← original program 1 (kept for reference)
```

---

## How the two programs work together

```
                         Browser
                            │
              ┌─────────────┴──────────────┐
              │   Map frontend (Next.js)   │
              │  /  /deep-dive  /sector-scan
              └──────┬──────────────┬──────┘
                     │              │
        /api/generate│              │/api/run-pipeline(-stream)
        (self-contained)            (server-side proxy)
                     │              │
                     ▼              ▼
        SEC EDGAR · Wikipedia   FastAPI backend (Python)
        OpenAlex (direct)       │
                                ▼
                     SEC EDGAR · ClinicalTrials.gov
                     PubMed (Entrez) · NIH RePORTER
```

1. **Company Deep Dive is fully self-contained in the frontend.** The
   `/api/generate` Next.js route streams a markdown report: seven curated
   companies are served from `content/reports/*.md`; any other public company
   is assembled live from SEC EDGAR (CIK resolution, XBRL financials, 10-K
   narrative, Form 4 executives), Wikipedia, and OpenAlex.

2. **Sector Scan splits frontend and backend.** The UI posts a sector to
   `/api/run-pipeline` (or the SSE variant for live progress). That Next.js
   route is a **server-side proxy** that forwards the request to the Python
   FastAPI backend, set by the `BACKEND_API_URL` environment variable. The
   backend picks seed companies for the sector, fetches real, citable data
   per company in parallel (SEC EDGAR, ClinicalTrials.gov, PubMed, NIH
   RePORTER), deterministically assembles a 7-section partnership report,
   validates every source URL against a blocklist (no Wikipedia, no
   aggregators), and returns JSON the React components render — with Excel,
   Slides, 3-D Visuals, and Trends views and one-click DOCX/PDF/PPTX/XLSX
   export.

3. **The frontend–backend connection is one environment variable.**
   `BACKEND_API_URL` on the frontend points at the deployed backend. Nothing
   else is shared; the proxy keeps the browser same-origin (no CORS issues)
   and never caches, so every search is a fresh report.

### The strict no-API-key rule

- The deep-dive engine calls only keyless endpoints (SEC asks for a
  descriptive `User-Agent`, which `map/lib/http.ts` sets).
- The sector-scan backend's `/run-pipeline` path is **keyless by design** —
  its orchestrator is documented "free, no API keys." A legacy
  `claude_client.py` exists in the codebase but is *not* used by the
  pipeline route and silently falls back to a deterministic stub when no key
  is configured. **No environment variable containing a key is required or
  set anywhere.**

---

## Local development

Two terminals:

```bash
# 1. backend (Python 3.12+)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn aria_pi.orchestrator:app --port 8000

# 2. frontend
cd map
npm install
BACKEND_API_URL=http://localhost:8000 npm run dev
# open http://localhost:3000
```

No API keys. No other environment variables.

## Deployment (Vercel, free tier)

Deploy as **two Vercel projects**:

1. **Backend** — deploy the `backend/` directory (its `vercel.json` routes
   everything through `api/index.py` via `@vercel/python`).
2. **Frontend** — deploy the `map/` directory and set one environment
   variable: `BACKEND_API_URL=https://<your-backend>.vercel.app`.

---

## Data sources (all free, all keyless)

| Source | Used by | Provides |
|---|---|---|
| SEC EDGAR (tickers, submissions, XBRL, archives) | both | financials, filings, 10-K text, Form 4 executives |
| Wikipedia REST | deep-dive | narrative company overview |
| OpenAlex | deep-dive | research-output signals |
| ClinicalTrials.gov v2 | sector-scan | company trial pipelines |
| PubMed (Entrez) | sector-scan | UNC co-authorship / research alignment |
| NIH RePORTER | sector-scan | grant funding signals |

---

**Disclaimer.** Independent project — not created by, affiliated with, or
endorsed by UNC Chapel Hill. For informational purposes only; not investment
advice.
