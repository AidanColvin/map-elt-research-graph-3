# Map — Intelligence Reporting Tool

## What It Does
Map automatically generates two types of research reports: **company deep-dives** (board-ready profiles built from SEC filings and public data) and **sector scans** (partnership intelligence mapping companies in a given industry against UNC Chapel Hill's research capacity). Reports stream in real time and export to PDF, Word, Excel, and PowerPoint.

## Problems It Solves
- Analysts spend hours pulling data from 5+ sources manually — Map does it in seconds
- AI report tools cost money per query and hallucinate — Map uses deterministic assembly with zero LLM cost
- Reports lack source traceability — every claim in Map is validated against two primary sources
- Company narratives are unreliable — Map uses the company's own SEC filings verbatim
- Partnership discovery is opaque — Map surfaces research overlap between companies and the university automatically

## Goals
- **Zero cost to operate** — no API keys, no paid services, no per-request fees
- **Full source transparency** — every number and sentence traces to a free, primary public source
- **Remove mechanical labor** — not to replace analyst judgment, but to eliminate data assembly gruntwork
- **University-focused** — built to help partnership teams identify and prioritize industry relationships

## How It Works
Two independently deployed services (Vercel):
- **Frontend** (Next.js) handles auth, streaming UI, company profile generation, and exports
- **Backend** (FastAPI) orchestrates sector scans — fans out to up to 22 companies in parallel under a 44-second budget, assembles 7-section reports, and validates all claims

Three report paths:
1. **Curated** — 7 hand-written reports (Apple, NVIDIA, Microsoft, etc.) served instantly from disk
2. **Live company** — resolves ticker → SEC CIK → fetches filings, financials, leadership → builds structured Markdown with charts
3. **Sector scan** — resolves sector to a company set → parallel API fetch → deterministic report assembly → source validation → streaming delivery

## Where Data Is Pulled From

| Source | What It Provides |
|---|---|
| **SEC EDGAR** | Company filings, 10-K narratives, XBRL financials, Form 4 executive data |
| **Wikipedia REST API** | Company overviews and background |
| **OpenAlex** | Recent research output |
| **ClinicalTrials.gov** | Company-sponsored clinical trials |
| **PubMed (Entrez)** | UNC co-authored publications |
| **NIH RePORTER** | Federal grants mentioning a company |

All sources are **free, keyless, and primary** — no aggregators, no paywalls.
