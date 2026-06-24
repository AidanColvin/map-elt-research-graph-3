# NAICS 24-Sector QA — results

Method: every sector run through the **live production backend**
(`map-backend-iota.vercel.app/run-pipeline`, the exact JSON the UI renders),
inspecting `_meta.resolution`, the selected company set, and SEC-sourced revenue.
Generate-and-inspect only — nothing saved/exported/downloaded.

## Root cause (before)
The Projects UI lets users search the broad 2-digit NAICS sector names. 17 of 24
had no curated route in `backend/aria_pi/sectors.py` and fell through to live SEC
full-text discovery → frequency-ranked OTC shells / blank-check SPACs. `Hospitals`
also mis-mapped to the broad `healthcare` umbrella (payers + pharma), not hospital
operators.

## Fix
Added curated 15-company seed lists + exact-alias/keyword/fuzzy routing + domain
tags for every NAICS supersector in `sectors.py`. Government / Education /
Hospitals / Management-of-Companies got hand-built lists (SEC discovery is
structurally weak for those mostly nonprofit/public sectors). Regression tests in
`test_sectors.py` (24 NAICS cases + hospitals-distinct-from-healthcare +
robustness). 242 backend tests pass. Deployed `map-backend` to Vercel prod.

## Result — all 24 PASS (curated, real, on-sector, plausible revenue)

| # | Sector | Resolution | Note |
|---|--------|-----------|------|
| 1 | Real Estate and Rental and Leasing | curated | REITs + United Rentals/Ryder/Avis/AerCap. ~$156B |
| 2 | State and Local Government | curated | Tyler Tech, Maximus, Conduent, Booz Allen. ~$160B |
| 3 | Finance and Insurance | curated | Banks + insurers (JPM, BofA, Chubb, MetLife) |
| 4 | Health Care and Social Assistance | curated | broad healthcare (payers/pharma/providers) |
| 5 | Professional and Technical Services | curated | Accenture, Gartner, Jacobs, Booz Allen |
| 6 | Durable Goods Manufacturing | curated | Caterpillar, Deere, Boeing, GM |
| 7 | Nondurable Goods Manufacturing | curated | P&G, Coca-Cola, PepsiCo, Mondelez |
| 8 | Wholesale Trade | curated | McKesson, Cencora, Sysco, Grainger |
| 9 | Retail Trade | curated→retail | Walmart, Amazon, Costco, Target |
| 10 | Information | curated | Alphabet, Meta, Microsoft, Comcast, Verizon |
| 11 | Construction | curated | D.R. Horton, Lennar, Fluor, Quanta |
| 12 | Transportation and Warehousing | curated | Union Pacific, FedEx, UPS, Delta |
| 13 | Administrative and Waste Management Services | curated | WM, Republic, Cintas, Aramark |
| 14 | Accommodation and Food Services | curated | McDonald's, Starbucks, Marriott, Hilton |
| 15 | Federal Government | curated | Lockheed, RTX, Northrop, Leidos, Palantir |
| 16 | Mining and Oil Extraction | curated | Exxon, Chevron, Freeport, Newmont. ~$757B |
| 17 | Agriculture and Forestry | curated | Deere, ADM, Bunge, Weyerhaeuser, Rayonier |
| 18 | Utilities | curated | NextEra, Duke, Southern, Exelon |
| 19 | Educational Services | curated | Grand Canyon, Adtalem, Coursera, Duolingo. ~$17B |
| 20 | Management of Companies | curated | Berkshire, Icahn, Loews, Brookfield, Markel |
| 21 | Arts and Entertainment | curated | Disney, Netflix, Live Nation, TKO, MSG. ~$360B |
| 22 | Commercial Banking | curated→finance | JPM, BofA, Wells, Citi, US Bancorp |
| 23 | Hospitals | curated | HCA, Tenet, UHS, CHS — operators, NOT payers/pharma. ~$176B |
| 24 | Broadcasting and Telecommunications | curated→telecom | Verizon, AT&T, T-Mobile, Comcast |

Across audited sectors, 12–14 of 15 companies per sector carry real SEC-sourced
revenue (FY2025). No SPACs, shells, penny stocks, off-sector junk, or $0 filler.

Search robustness verified: `govt`→state/local, `hosptials`→hospitals,
`constuction`→construction, `transporation`→transportation, `oil & gas`→mining/oil.
