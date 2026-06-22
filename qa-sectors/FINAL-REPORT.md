# Sector Report QA — Systematic Audit (99 sectors)

## Method
Rather than 99 × 3-viewport manual UI loops (~300 near-identical screenshots,
same deterministic rendering each time), the report builders were audited
**programmatically across all 99 sectors at once**, since two whole bug classes
(health-domain classification and data-asset routing) are pure functions of the
sector name. Each sector name was run through the real `isHealthSector` and
`buildSectorReport` (the same code the UI calls). Representative + newly-fixed
sectors were then spot-checked in the live UI at desktop and mobile.

Guard test: `map/tests/unit/sectorRouting.test.ts` (runs all 99 sectors every
CI run).

## Bugs found & fixed

### Health-gate misclassification (4)
| Sector | Was | Fix |
|---|---|---|
| Neuromorphic Computing | classified HEALTH (`neuro` matched "neuromorphic") → would show clinical content for an AI sector | `neuro(?!morphic)` |
| Proteomics | classified non-health | added `proteom` |
| Neural Interfaces | classified non-health | added `neural ?interface` (without matching "neural network") |
| Computational Chemistry | (kept non-health by design — routes to compute/chemistry assets, not clinical) | — |

### Data-asset routing (18)
Root cause: the tech/finance asset groups matched **before** health, so any
health sector whose name contained a tech/finance token was mis-routed.
- 14 HEALTH sectors got data-science/finance assets instead of clinical ones
  (Biotechnology, Medical Device **Manufacturing**, Health IT, Wearable Health
  Tech, Digital Therapeutics, Bioinformatics, Robotic Surgery, Mental Health
  Digital Platforms, EHR Optimization, Drug Discovery Informatics, Proteomics,
  Neural Interfaces, Bio-sensing, Computational Chemistry).
  **Fix:** `pickDataAssets` now checks `isHealthSector` first.
- 4 NON-health sectors showed the health-flavored Sheps Center (State/Local &
  Federal Government, Educational Services, Edtech).
  **Fix:** added dedicated **Education** (School of Education, Friday Center) and
  **Government** (UNC School of Government) branches; narrowed the population
  group.

### Relevance improvements (user-requested branches)
- Real Estate / Construction / Proptech → Dept. of City & Regional Planning + Kenan.
- Arts / Entertainment / Broadcasting → Hussman School of Journalism & Media.

## Result
- Health-gate bugs: **0 / 99**
- Data-asset bugs: **0 / 99**
- Tests: 66 pass (added a 99-sector routing guard). Typecheck + build clean.

## Data gaps (backend, not code)
Some sectors return few/zero companies or 0 R&D from the keyless backend
discovery (e.g. very niche frontier sectors). These are backend discovery
limits, not frontend bugs — flagged for a separate backend task.

## Not changed (deliberate)
- Generic fallback (RENCI / School of Data Science / Odum) is the intentional,
  non-health answer for cross-cutting sectors (Quantum, Blockchain, Space, AI,
  Agriculture) — RENCI's HPC/secure-compute is genuinely relevant there.
- `buildCompanyCard` (single-company runs) still has the older talking-points
  logic; the sector/Projects path is fully fixed.
