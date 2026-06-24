"""Shared sector resolution — single source of truth for both the
orchestrator (which picks seed companies) and the report builder (which picks
curated sector context). Keeping these aligned ensures a search resolves to the
SAME sector for company selection and for definition / NC context / UNC units.
"""
from typing import List, Optional

# Canonical sector key → top-15 companies per sector.
# 15 seeds give the orchestrator enough candidates to surface the 10 most
# data-rich companies for a full report even when 1–2 firms are private or
# return sparse SEC/trials data within the fetch budget.
SECTOR_SEEDS = {
    # ── Life sciences / health ────────────────────────────────────────────
    "oncology": ["Merck", "Bristol-Myers Squibb", "Pfizer", "Eli Lilly", "AstraZeneca",
                 "Roche", "Novartis", "Johnson & Johnson", "Regeneron", "Incyte",
                 "Amgen", "Gilead Sciences", "AbbVie", "Sanofi", "Blueprint Medicines"],
    "biotech": ["Moderna", "Vertex Pharmaceuticals", "Regeneron", "BioMarin", "Alnylam",
                "Biogen", "Gilead Sciences", "Amgen", "Neurocrine Biosciences", "Karuna Therapeutics",
                "CRISPR Therapeutics", "Beam Therapeutics", "Intellia Therapeutics", "Recursion Pharmaceuticals", "Arctus Biotherapeutics"],
    "pharmaceutical": ["Johnson & Johnson", "Pfizer", "Merck", "Eli Lilly", "AbbVie",
                       "Bristol-Myers Squibb", "AstraZeneca", "Novartis", "Roche", "GSK",
                       "Sanofi", "Amgen", "Gilead Sciences", "Takeda Pharmaceutical", "Biogen"],
    "ag-bio": ["Corteva", "Bayer", "Syngenta", "Ginkgo Bioworks", "Pivot Bio",
               "Nutrien", "CF Industries", "Mosaic", "FMC Corporation", "American Vanguard",
               "Scotts Miracle-Gro", "ICL Group", "Balchem Corporation", "Innospec", "Cabot Corporation"],
    "medtech": ["Medtronic", "Boston Scientific", "Stryker", "Abbott Laboratories", "Edwards Lifesciences",
                "Becton Dickinson", "Zimmer Biomet", "Intuitive Surgical", "ResMed", "Hologic",
                "Align Technology", "DexCom", "Insulet Corporation", "Haemonetics", "Merit Medical Systems"],
    "rural health": ["Teladoc Health", "Doximity", "HCA Healthcare", "Hims & Hers Health",
                     "LifePoint Health", "Community Health Systems", "Encompass Health", "Acadia Healthcare",
                     "Tenet Healthcare", "Option Care Health",
                     "Amedisys", "LHC Group", "National HealthCare Corporation", "Privia Health", "Accolade"],
    # Broad "healthcare" umbrella — deliberately diversified across payers,
    # pharma, medical devices, pharmacy/health services, and hospital systems.
    "healthcare": ["UnitedHealth Group", "Johnson & Johnson", "Pfizer", "Eli Lilly", "Merck",
                   "Abbott Laboratories", "CVS Health", "Cigna", "Elevance Health", "HCA Healthcare",
                   "Humana", "Molina Healthcare", "Centene Corporation", "Tenet Healthcare", "DaVita"],
    # Electronic health records / health IT. Epic Systems and Meditech are private
    # (no SEC filings), so this curated set covers public, sourceable vendors.
    "health it": ["Oracle", "Veeva Systems", "Doximity", "Health Catalyst", "Evolent Health",
                  "Phreesia", "Definitive Healthcare", "Computer Programs and Systems", "Teladoc Health", "Premier",
                  "Inovalon Holdings", "Consensus Cloud Solutions", "Alignment Healthcare", "Accolade", "Privia Health"],
    # Digital health / "health tech" — wearables, telehealth, remote patient
    # monitoring, connected devices, and consumer health platforms. This is the
    # set a user means when they search "health tech": Apple (Health/Watch),
    # Alphabet (Fitbit/Verily), and the public device + telehealth pure-plays —
    # NOT the random OTC shells a live "health tech" full-text search returns.
    "digital health": ["Apple", "Alphabet", "DexCom", "Teladoc Health", "Hims & Hers Health",
                       "GE HealthCare", "Masimo", "iRhythm Technologies", "Garmin", "ResMed",
                       "Doximity", "Phreesia", "Health Catalyst", "Insulet Corporation", "Abbott Laboratories"],
    # ── Technology ────────────────────────────────────────────────────────
    # FAANG + major public tech: Meta (Facebook), Apple, Amazon, Netflix,
    # Alphabet (Google) plus Microsoft, NVIDIA, and top hardware/enterprise players.
    "technology": ["Apple", "Microsoft", "NVIDIA", "Alphabet", "Meta Platforms",
                   "Amazon", "Netflix", "Intel", "IBM", "Oracle",
                   "Cisco Systems", "Qualcomm", "Broadcom", "Advanced Micro Devices", "Salesforce"],
    "software": ["Microsoft", "Salesforce", "Adobe", "ServiceNow", "Snowflake",
                 "Workday", "Intuit", "Autodesk", "Palantir Technologies", "Veeva Systems",
                 "Zoom Video Communications", "HubSpot", "Datadog", "MongoDB", "Atlassian"],
    # Public, SEC-filing AI leaders only — private labs (OpenAI, Anthropic, xAI)
    # don't file with the SEC, so they can't be sourced from free public filings.
    "artificial intelligence": ["NVIDIA", "Microsoft", "Alphabet", "Amazon", "Meta Platforms",
                                 "Palantir Technologies", "Advanced Micro Devices", "Broadcom",
                                 "Oracle", "C3.ai",
                                 "Snowflake", "Salesforce", "IBM", "Intel", "Cisco Systems"],
    "semiconductors": ["NVIDIA", "Advanced Micro Devices", "Intel", "Broadcom", "Qualcomm",
                       "Texas Instruments", "Micron Technology", "Applied Materials", "Lam Research", "TSMC",
                       "Marvell Technology", "Analog Devices", "NXP Semiconductors", "ON Semiconductor", "Skyworks Solutions"],
    "cybersecurity": ["CrowdStrike", "Palo Alto Networks", "Fortinet", "Zscaler", "Okta",
                      "SentinelOne", "Tenable Holdings", "CyberArk Software", "Varonis Systems", "Rapid7",
                      "Cloudflare", "Check Point Software", "Qualys", "Darktrace", "Rubrik"],
    "cloud computing": ["Amazon", "Microsoft", "Alphabet", "Oracle", "Snowflake",
                        "Salesforce", "IBM", "Cloudflare", "DigitalOcean", "Akamai Technologies",
                        "MongoDB", "HashiCorp", "Fastly", "Rackspace Technology", "Nutanix"],
    "fintech": ["Visa", "Mastercard", "PayPal", "Block", "Fiserv",
                "Adyen", "Affirm Holdings", "Marqeta", "SoFi Technologies", "Global Payments",
                "Flywire Corporation", "Green Dot Corporation", "Nuvei Corporation", "Repay Holdings", "Payoneer Global"],
    "quantum computing": ["IBM", "IonQ", "Rigetti Computing", "D-Wave Quantum", "Microsoft",
                          "Honeywell International", "Alphabet", "Intel", "Amazon", "NVIDIA",
                          "Leidos Holdings", "Booz Allen Hamilton", "Raytheon Technologies", "SAIC", "Northrop Grumman"],
    "robotics": ["Intuitive Surgical", "Rockwell Automation", "Teradyne", "Zebra Technologies", "Symbotic",
                 "ABB", "Cognex", "Roper Technologies", "Applied Industrial Technologies", "Watts Water Technologies",
                 "Keyence", "Yaskawa Electric", "Omron", "Brooks Automation", "Onto Innovation"],
    # Public social media / social networking platforms that file with the SEC.
    # Twitter/X (private), TikTok/ByteDance (private/Chinese) can't be sourced
    # from free SEC filings, so those are excluded from this curated list.
    # Alphabet (YouTube/Google) and Microsoft (LinkedIn) are included because
    # they own major social platforms even though they aren't pure-play social.
    "social media": ["Meta Platforms", "Snap", "Pinterest", "Reddit",
                     "Alphabet", "Microsoft", "Bumble", "Match Group",
                     "IAC", "Sprout Social", "Yelp", "ZoomInfo Technologies",
                     "Duolingo", "Discord"],
    "telecom": ["Verizon", "AT&T", "T-Mobile US", "Cisco Systems", "Comcast",
                "Charter Communications", "Lumen Technologies", "Crown Castle", "American Tower", "Qualcomm",
                "DISH Network", "Telephone and Data Systems", "SBA Communications", "Calix", "Ribbon Communications"],
    # ── Energy / climate / mobility ───────────────────────────────────────
    "climate tech": ["Tesla", "First Solar", "Enphase Energy", "Plug Power", "Bloom Energy",
                     "Array Technologies", "Sunrun", "Sunnova Energy", "Stem", "Fluence Energy",
                     "Shoals Technologies", "Altus Power", "TPI Composites", "Clearway Energy", "Pattern Energy"],
    "energy": ["NextEra Energy", "First Solar", "Enphase Energy", "Bloom Energy", "Plug Power",
               "Exxon Mobil", "Chevron", "ConocoPhillips", "SLB", "Halliburton",
               "Duke Energy", "Southern Company", "Dominion Energy", "Entergy", "Consolidated Edison"],
    "automotive": ["Tesla", "General Motors", "Ford Motor", "Rivian Automotive", "Lucid Group",
                   "Toyota", "Volkswagen", "Stellantis", "NIO", "Li Auto",
                   "Aptiv", "BorgWarner", "Lear Corporation", "Modine Manufacturing", "Dorman Products"],
    "aerospace": ["Boeing", "Lockheed Martin", "RTX", "Northrop Grumman", "General Dynamics",
                  "L3Harris Technologies", "Textron", "Leidos Holdings", "HEICO", "TransDigm Group",
                  "Spirit AeroSystems", "Moog", "Mercury Systems", "Curtiss-Wright", "Ducommun"],
    # ── Consumer / industrial / finance ───────────────────────────────────
    # Footwear — public SEC-filing companies only; Nike/Adidas are dual-listed
    # (both footwear + apparel). Skechers, Foot Locker, Deckers, Wolverine
    # World Wide, Caleres, Genesco, G-III Apparel are US-listed pure-plays.
    "footwear": ["Nike", "Adidas", "Skechers", "Foot Locker", "Deckers Outdoor",
                 "Wolverine World Wide", "Steve Madden", "Caleres", "Genesco", "G-III Apparel Group",
                 "Columbia Sportswear", "Under Armour", "Crocs", "On Holding", "Vans"],
    "shoes": ["Nike", "Adidas", "Skechers", "Foot Locker", "Deckers Outdoor",
              "Wolverine World Wide", "Steve Madden", "Caleres", "Genesco", "G-III Apparel Group",
              "Columbia Sportswear", "Under Armour", "Crocs", "On Holding", "Levi Strauss"],
    # Laptops, phones, TVs, tablets — public SEC-filing hardware companies.
    "consumer electronics": ["Apple", "HP", "Dell Technologies", "Lenovo", "Samsung Electronics",
                             "Sony", "LG Electronics", "Microsoft", "ASUS", "Acer",
                             "Logitech", "Corsair Gaming", "Turtle Beach", "Knowles Corporation", "Plantronics"],
    # Video games, consoles, game engines — public companies only.
    "gaming": ["NVIDIA", "Advanced Micro Devices", "Microsoft", "Electronic Arts", "Take-Two Interactive",
               "Activision Blizzard", "Roblox", "Unity Software", "CD Projekt", "Ubisoft",
               "Sony", "Nintendo", "Corsair Gaming", "Turtle Beach", "SciPlay Corporation"],
    "streaming": ["Netflix", "Walt Disney", "Warner Bros Discovery", "Alphabet", "Amazon",
                  "Apple", "Comcast", "Paramount Global", "Spotify Technology", "Sirius XM Holdings",
                  "FuboTV", "Roku", "LiveRamp Holdings", "The Trade Desk", "Digital Turbine"],
    "consumer": ["Procter & Gamble", "Coca-Cola", "PepsiCo", "Nike", "Costco Wholesale",
                 "Unilever", "Colgate-Palmolive", "Kimberly-Clark", "Estee Lauder", "Church & Dwight",
                 "Clorox", "Hershey", "General Mills", "Hasbro", "Mattel"],
    "retail": ["Walmart", "Amazon", "Costco Wholesale", "Target", "Home Depot",
               "Lowe's", "Kroger", "TJX Companies", "Dollar General", "Best Buy",
               "Dollar Tree", "Walgreens Boots Alliance", "Macy's", "Ross Stores", "Gap"],
    "finance": ["JPMorgan Chase", "Bank of America", "Goldman Sachs", "Morgan Stanley", "BlackRock",
                "Wells Fargo", "Citigroup", "Charles Schwab", "American Express", "Berkshire Hathaway",
                "U.S. Bancorp", "PNC Financial Services", "State Street", "T. Rowe Price", "Raymond James Financial"],
    "insurance": ["Berkshire Hathaway", "Progressive", "Allstate", "Travelers", "Chubb",
                  "MetLife", "Prudential Financial", "American International Group", "Aflac", "Marsh & McLennan",
                  "Unum Group", "Principal Financial Group", "Lincoln National", "Sun Life Financial", "Reinsurance Group of America"],
    "industrial": ["Caterpillar", "Honeywell International", "General Electric", "3M", "Emerson Electric",
                   "Parker Hannifin", "Eaton", "Illinois Tool Works", "Deere & Company", "Cummins",
                   "Rockwell Automation", "Dover Corporation", "Xylem", "IDEX Corporation", "Watts Water Technologies"],
    # ── S&P 500 GICS sectors (the 11-sector taxonomy) ─────────────────────
    # Curated so every standard S&P sector resolves to on-topic, SEC-filing
    # public companies instead of falling to live discovery (which mismatches
    # category phrases like "Consumer Discretionary") or generic megacaps.
    "consumer discretionary": ["Amazon", "Tesla", "Home Depot", "McDonald's", "Booking Holdings",
                               "Lowe's", "TJX Companies", "Nike", "Starbucks", "Chipotle Mexican Grill",
                               "Marriott International", "Ford Motor", "General Motors", "Yum! Brands", "Ross Stores"],
    "communication services": ["Alphabet", "Meta Platforms", "Netflix", "Walt Disney", "Comcast",
                               "Verizon", "AT&T", "T-Mobile US", "Charter Communications", "Warner Bros Discovery",
                               "Electronic Arts", "Take-Two Interactive", "Paramount Global", "Fox Corporation", "Omnicom Group"],
    "consumer staples": ["Procter & Gamble", "Coca-Cola", "PepsiCo", "Costco Wholesale", "Walmart",
                         "Philip Morris International", "Mondelez International", "Altria Group", "Colgate-Palmolive", "Kimberly-Clark",
                         "General Mills", "Kraft Heinz", "Kroger", "Archer-Daniels-Midland", "Sysco"],
    "utilities": ["NextEra Energy", "Southern Company", "Duke Energy", "Dominion Energy", "American Electric Power",
                  "Exelon", "Sempra", "Xcel Energy", "Constellation Energy", "Public Service Enterprise Group",
                  "Consolidated Edison", "WEC Energy Group", "Entergy", "American Water Works", "Edison International"],
    "materials": ["Linde", "Sherwin-Williams", "Air Products and Chemicals", "Ecolab", "Freeport-McMoRan",
                  "Nucor", "Dow", "DuPont de Nemours", "Corteva", "Newmont",
                  "PPG Industries", "Vulcan Materials", "Nutrien", "International Paper", "Martin Marietta Materials"],
    "real estate": ["Prologis", "American Tower", "Equinix", "Welltower", "Public Storage",
                    "Simon Property Group", "Digital Realty Trust", "Realty Income", "CBRE Group", "Crown Castle",
                    "Extra Space Storage", "AvalonBay Communities", "VICI Properties", "Iron Mountain", "CoStar Group"],
    # ── NAICS supersectors (the 2-digit industry taxonomy the Projects UI uses) ──
    # Curated so each broad NAICS sector resolves to real, recognizable, SEC-filing
    # public companies in that sector instead of falling through to live full-text
    # discovery (which returns frequency-ranked OTC shells / blank-check SPACs).
    "real estate and rental and leasing": [
        "Prologis", "American Tower", "Equinix", "Simon Property Group", "Welltower",
        "Public Storage", "Realty Income", "Digital Realty Trust", "CBRE Group", "Crown Castle",
        "United Rentals", "Ryder System", "Avis Budget Group", "WillScot Mobile Mini", "AerCap Holdings"],
    "finance and insurance": [
        "JPMorgan Chase", "Bank of America", "Wells Fargo", "Citigroup", "Goldman Sachs",
        "Morgan Stanley", "American Express", "Berkshire Hathaway", "BlackRock", "Chubb",
        "Progressive", "MetLife", "Prudential Financial", "Marsh & McLennan", "Travelers"],
    "professional and technical services": [
        "Accenture", "Booz Allen Hamilton", "Gartner", "Jacobs Solutions", "AECOM",
        "Leidos Holdings", "Science Applications International", "ICF International", "CACI International", "Parsons",
        "Verisk Analytics", "FTI Consulting", "Robert Half", "ManpowerGroup", "Omnicom Group"],
    "durable goods manufacturing": [
        "Caterpillar", "Deere & Company", "General Electric", "Boeing", "Honeywell International",
        "3M", "Lockheed Martin", "Ford Motor", "General Motors", "Illinois Tool Works",
        "Emerson Electric", "Parker Hannifin", "Cummins", "Stanley Black & Decker", "Whirlpool"],
    "nondurable goods manufacturing": [
        "Procter & Gamble", "Coca-Cola", "PepsiCo", "Philip Morris International", "Mondelez International",
        "Kraft Heinz", "General Mills", "Colgate-Palmolive", "Kimberly-Clark", "Archer-Daniels-Midland",
        "Tyson Foods", "Kellanova", "Hershey", "Clorox", "International Paper"],
    "wholesale trade": [
        "McKesson", "Cencora", "Cardinal Health", "Sysco", "US Foods",
        "W.W. Grainger", "Genuine Parts", "WESCO International", "Fastenal", "Performance Food Group",
        "LKQ Corporation", "Watsco", "Avnet", "Arrow Electronics", "Core & Main"],
    "information": [
        "Alphabet", "Meta Platforms", "Microsoft", "Netflix", "Comcast",
        "Walt Disney", "Verizon", "AT&T", "Charter Communications", "Warner Bros Discovery",
        "Paramount Global", "Fox Corporation", "Thomson Reuters", "News Corp", "T-Mobile US"],
    "construction": [
        "D.R. Horton", "Lennar", "PulteGroup", "NVR", "Toll Brothers",
        "Fluor", "Jacobs Solutions", "AECOM", "KBR", "Quanta Services",
        "MasTec", "EMCOR Group", "Comfort Systems USA", "Granite Construction", "Sterling Infrastructure"],
    "transportation and warehousing": [
        "Union Pacific", "CSX", "Norfolk Southern", "FedEx", "United Parcel Service",
        "Delta Air Lines", "United Airlines Holdings", "Southwest Airlines", "J.B. Hunt Transport Services", "Old Dominion Freight Line",
        "C.H. Robinson Worldwide", "Knight-Swift Transportation", "XPO", "Expeditors International", "Ryder System"],
    "administrative and waste management services": [
        "Waste Management", "Republic Services", "Waste Connections", "GFL Environmental", "Clean Harbors",
        "Cintas", "Rollins", "ABM Industries", "Aramark", "ManpowerGroup",
        "Robert Half", "Casella Waste Systems", "UniFirst", "Healthcare Services Group", "Brink's"],
    "accommodation and food services": [
        "McDonald's", "Starbucks", "Chipotle Mexican Grill", "Yum! Brands", "Darden Restaurants",
        "Marriott International", "Hilton Worldwide", "Hyatt Hotels", "Wendy's", "Domino's Pizza",
        "Texas Roadhouse", "Las Vegas Sands", "MGM Resorts International", "Booking Holdings", "Airbnb"],
    "mining and oil extraction": [
        "Exxon Mobil", "Chevron", "ConocoPhillips", "EOG Resources", "Occidental Petroleum",
        "Devon Energy", "Diamondback Energy", "Coterra Energy", "Hess", "Marathon Oil",
        "Freeport-McMoRan", "Newmont", "Schlumberger", "Halliburton", "Baker Hughes"],
    "agriculture and forestry": [
        "Deere & Company", "Archer-Daniels-Midland", "Bunge Global", "Corteva", "Nutrien",
        "Tyson Foods", "CF Industries", "Mosaic", "Weyerhaeuser", "Rayonier",
        "PotlatchDeltic", "Fresh Del Monte Produce", "Andersons", "Tractor Supply", "Adecoagro"],
    "arts and entertainment": [
        "Walt Disney", "Netflix", "Warner Bros Discovery", "Live Nation Entertainment", "TKO Group Holdings",
        "Madison Square Garden Entertainment", "Endeavor Group", "Cinemark Holdings", "Paramount Global", "Comcast",
        "Electronic Arts", "Take-Two Interactive", "Roblox", "Sphere Entertainment", "AMC Entertainment"],
    # Hospitals — pure hospital / facility / care-delivery operators (NOT the broad
    # "healthcare" umbrella of payers + pharma). Most large US hospital systems are
    # nonprofit and don't file with the SEC; this is the recognizable public set.
    "hospitals": [
        "HCA Healthcare", "Tenet Healthcare", "Universal Health Services", "Community Health Systems", "Encompass Health",
        "Acadia Healthcare", "Select Medical Holdings", "Surgery Partners", "Ensign Group", "DaVita",
        "Option Care Health", "Pediatrix Medical Group", "US Physical Therapy", "Brookdale Senior Living", "Addus HomeCare"],
    # Educational Services — sector is mostly nonprofit/public, so SEC discovery is
    # structurally weak. Curated set of the real public education companies.
    "educational services": [
        "Grand Canyon Education", "Adtalem Global Education", "Strategic Education", "Perdoceo Education", "Laureate Education",
        "Stride", "Chegg", "Coursera", "Duolingo", "Graham Holdings",
        "American Public Education", "Lincoln Educational Services", "Universal Technical Institute", "Nerdy", "Docebo"],
    # Management of Companies (NAICS 55) — holding companies & diversified
    # conglomerates that own/manage operating subsidiaries.
    "management of companies": [
        "Berkshire Hathaway", "Icahn Enterprises", "Loews Corporation", "Brookfield Corporation", "Markel Group",
        "Jefferies Financial Group", "Compass Diversified", "Honeywell International", "Danaher", "Roper Technologies",
        "Illinois Tool Works", "Dover Corporation", "3M", "Emerson Electric", "Parker Hannifin"],
    # State & Local Government — almost entirely public/nonprofit, so SEC discovery
    # cannot surface it. Curated set of the recognizable govtech vendors and
    # government-services contractors that serve state & local governments.
    "state and local government": [
        "Tyler Technologies", "Maximus", "Conduent", "Verra Mobility", "Booz Allen Hamilton",
        "Leidos Holdings", "Science Applications International", "ICF International", "CACI International", "Parsons",
        "Unisys", "DXC Technology", "Accenture", "NV5 Global", "Jacobs Solutions"],
    # Federal Government — the recognizable public federal contractors (defense +
    # IT/services), the entities a partnership team would actually engage.
    "federal government": [
        "Lockheed Martin", "RTX", "Northrop Grumman", "General Dynamics", "Boeing",
        "L3Harris Technologies", "Leidos Holdings", "Booz Allen Hamilton", "Science Applications International", "CACI International",
        "Parsons", "Palantir Technologies", "ICF International", "V2X", "Maximus"],
}

# NC-based companies added on top of the global seeds for each sector.
# These are always fetched and profiled in addition to the top-15 global list
# so a Technology search surfaces SAS Institute, Red Hat, Epic Games, etc.
# alongside Apple and Microsoft.  Private companies (SAS, Red Hat, Epic) will
# show partial profiles sourced from ClinicalTrials.gov / PubMed / NIH — they
# won't have SEC facts but are still valuable for UNC partnership context.
SECTOR_NC_SEEDS = {
    # Research Triangle / Cary / Raleigh / Morrisville tech cluster
    "technology": ["SAS Institute", "Red Hat", "Epic Games", "Lenovo",
                   "Bandwidth", "Pendo", "Duck Creek Technologies"],
    "software": ["SAS Institute", "Red Hat", "Bandwidth", "Pendo", "Duck Creek Technologies"],
    "artificial intelligence": ["SAS Institute", "Red Hat", "Lenovo"],
    "cloud computing": ["Red Hat", "SAS Institute", "Bandwidth"],
    "cybersecurity": ["Bandwidth", "Red Hat", "Pendo"],
    # RTP pharma / CRO corridor (Durham, Morrisville, RTP)
    "pharmaceutical": ["IQVIA Holdings", "Syneos Health", "PPD"],
    "biotech": ["IQVIA Holdings", "KBI Biopharma", "Avid Bioservices"],
    "healthcare": ["Labcorp", "Amedisys", "Aveanna Healthcare", "Atrium Health"],
    "medtech": ["Labcorp", "Nuo Therapeutics", "Haemonetics"],
    "health it": ["Netsmart Technologies", "Inovalon Holdings", "Privia Health"],
    "rural health": ["Labcorp", "Amedisys", "Atrium Health"],
    # Charlotte financial hub
    "finance": ["Truist Financial", "First Citizens BancShares", "Ally Financial",
                "LPL Financial", "Synchrony Financial"],
    "insurance": ["First American Financial", "Radian Group", "Employers Holdings"],
    "fintech": ["Truist Financial", "First Citizens BancShares", "Ally Financial"],
    # NC industrial / manufacturing
    "industrial": ["Nucor Corporation", "Sealed Air Corporation", "Sonoco Products",
                   "Enpro Industries", "SPX Technologies"],
    "aerospace": ["Spirit AeroSystems", "Triumph Group"],
    # NC energy / utilities
    "energy": ["Duke Energy", "Dominion Energy North Carolina"],
    "climate tech": ["Duke Energy", "Dominion Energy North Carolina"],
    "utilities": ["Duke Energy", "Dominion Energy North Carolina"],
    # Telecom
    "telecom": ["Bandwidth", "Limelight Networks"],
    # GICS sectors — NC-specific public companies where they exist
    "communication services": ["Bandwidth"],
    "materials": ["Albemarle", "Sonoco Products", "Sealed Air Corporation"],
    "real estate": ["Highwoods Properties", "Cousins Properties"],
}

# Broad domain per sector — used to pick which UNC datasets / talent programs
# are relevant. "health" assets only surface for health sectors, etc.
SECTOR_DOMAIN = {
    "oncology": "health", "biotech": "health", "pharmaceutical": "health",
    "ag-bio": "health", "medtech": "health", "rural health": "health",
    "health it": "health", "healthcare": "health", "digital health": "health",
    "technology": "tech", "software": "tech", "artificial intelligence": "tech",
    "semiconductors": "tech", "cybersecurity": "tech", "cloud computing": "tech",
    "quantum computing": "tech", "robotics": "tech", "telecom": "tech",
    "social media": "tech",
    "consumer electronics": "tech", "gaming": "tech", "streaming": "tech",
    "fintech": "business", "finance": "business", "insurance": "business",
    "consumer": "business", "retail": "business", "industrial": "business",
    "footwear": "business", "shoes": "business",
    "climate tech": "energy", "energy": "energy", "automotive": "energy",
    "aerospace": "energy",
    # S&P GICS sectors
    "consumer discretionary": "business", "consumer staples": "business",
    "communication services": "tech", "real estate": "business",
    "utilities": "energy", "materials": "energy",
    # NAICS supersectors — only "hospitals" is health (its clinical content is
    # legitimate); every other NAICS bucket is non-health so clinical-trial
    # content stays gated off.
    "real estate and rental and leasing": "business",
    "finance and insurance": "business",
    "professional and technical services": "business",
    "durable goods manufacturing": "business",
    "nondurable goods manufacturing": "business",
    "wholesale trade": "business", "information": "tech",
    "construction": "business", "transportation and warehousing": "business",
    "administrative and waste management services": "business",
    "accommodation and food services": "business",
    "mining and oil extraction": "energy", "agriculture and forestry": "business",
    "arts and entertainment": "tech", "hospitals": "health",
    "educational services": "general", "management of companies": "business",
    "state and local government": "general", "federal government": "general",
}

# Keyword → canonical sector key. Lets free-text / misspelled searches route to
# a sensible curated sector. Order matters: earlier, more-specific rules win.
_KEYWORD_ROUTES = [
    # ── NAICS supersector routes (checked first; specific multi-word phrases) ──
    # Order matters within this block: "nondurable" before "durable" (substring),
    # "federal" before generic "government", "waste" before "management".
    (("nondurable", "non-durable", "non durable"), "nondurable goods manufacturing"),
    (("durable goods", "durable manufactur"), "durable goods manufacturing"),
    (("federal government", "federal agenc", "federal contract"), "federal government"),
    (("state and local", "local government", "state government", "municipal",
      "public sector", "govt", "government"), "state and local government"),
    (("waste management", "waste services", "administrative and waste",
      "waste collection"), "administrative and waste management services"),
    (("management of compan", "holding compan", "conglomerate"), "management of companies"),
    (("wholesale", "distributor"), "wholesale trade"),
    (("transportation and warehous", "warehousing", "freight", "trucking",
      "railroad", "logistics"), "transportation and warehousing"),
    (("construction", "homebuild", "home build", "civil engineering"), "construction"),
    (("accommodation", "food service", "hospitality", "lodging"), "accommodation and food services"),
    (("mining and oil", "oil and gas extraction", "oil extraction", "oil & gas",
      "upstream oil", "drilling"), "mining and oil extraction"),
    (("agricultur", "forestry", "farming", "timber"), "agriculture and forestry"),
    (("educational service", "education service", "higher education", "edtech",
      "ed tech", "e-learning", "online learning"), "educational services"),
    (("arts and entertainment", "entertainment", "performing arts", "amusement",
      "recreation"), "arts and entertainment"),
    (("hospital",), "hospitals"),
    (("professional and technical", "professional service", "technical service",
      "management consult"), "professional and technical services"),
    (("finance and insurance",), "finance and insurance"),
    (("real estate and rental", "rental and leasing", "rental and lease"), "real estate and rental and leasing"),
    (("information services", "information sector"), "information"),
    (("oncolog", "cancer", "tumor"), "oncology"),
    (("pharma", "drug", "therapeut", "medicine"), "pharmaceutical"),
    (("biotech", "biolog", "genom", "gene therap", "mrna"), "biotech"),
    (("medtech", "medical device", "diagnostic", "imaging"), "medtech"),
    (("ehr", "electronic health record", "electronic medical record", "emr ",
      "epic", "cerner", "meditech", "health it", "health information",
      "clinical software"), "health it"),
    # Digital health / health tech — must precede the generic "tech" route so
    # "health tech" lands here (real wearable/telehealth firms) instead of the
    # broad "technology" bucket or live discovery (which returns OTC shells).
    (("digital health", "health tech", "healthtech", "ehealth", "e-health",
      "mhealth", "m-health", "connected health", "remote patient monitor",
      "remote monitoring", "wearable health", "health wearable",
      "digital medicine", "digital therapeutic"), "digital health"),
    (("rural", "telehealth", "telemedicine"), "rural health"),
    (("hospital", "managed care", "health system", "healthcare", "health care",
      "payer", "health plan"), "healthcare"),
    (("agric", "ag-bio", "agbio", "crop", "farm"), "ag-bio"),
    (("semiconductor", "chip", "microchip", "foundry"), "semiconductors"),
    (("cyber", "infosec", "security software"), "cybersecurity"),
    (("artificial intel", "machine learn", "genai", "llm", "deep learn", "neural"), "artificial intelligence"),
    (("cloud", "saas", "data warehouse"), "cloud computing"),
    (("fintech", "payment", "banking tech"), "fintech"),
    (("quantum",), "quantum computing"),
    (("robot", "automation"), "robotics"),
    (("laptop", "notebook computer", "personal computer", "desktop computer",
      "consumer electron", "smartphone", "mobile phone", "tablet computer",
      "iphone", "ipad", "wearable", "smartwatch", "headphone", "earphone",
      "television", "smart tv", "monitor display"), "consumer electronics"),
    (("video game", "gaming", "esport", "game console", "game engine",
      "pc game", "mobile game"), "gaming"),
    (("streaming", "video stream", "music stream", "ott", "svod"), "streaming"),
    (("social media", "social network", "social platform", "social app"), "social media"),
    (("telecom", "wireless", "broadband", "5g", "network"), "telecom"),
    (("software", "app ", "platform", "devtool"), "software"),
    (("climate", "clean energy", "decarbon", "carbon", "solar", "renewable"), "climate tech"),
    (("energy", "utility", "power grid", "grid", "battery"), "energy"),
    (("automot", "electric vehicle", "mobility", "vehicle"), "automotive"),
    (("aerospace", "defense", "defence", "aviation", "space"), "aerospace"),
    (("insurance", "insurer", "reinsur", "underwrit", "actuar"), "insurance"),
    (("bank", "asset manage", "capital market", "invest", "credit card",
      "wealth manage", "financial service"), "finance"),
    (("retail", "ecommerce", "e-commerce", "store"), "retail"),
    (("shoe", "footwear", "sneaker", "boot", "sandal"), "footwear"),
    (("consumer", "cpg", "apparel", "food", "beverage"), "consumer"),
    (("industrial", "manufactur", "machinery", "logistics"), "industrial"),
    (("tech", "computing", "digital", "internet", "hardware", "data"), "technology"),
]

# Fuzzy keyword routes that tolerate a missing/garbled vowel (e.g. "t4chnolgy").
# Checked only after the exact routes above fail.
_FUZZY_ROUTES = [
    ("technology", "technology"),
    ("software", "software"),
    ("pharma", "pharmaceutical"),
    ("biotech", "biotech"),
    ("finance", "finance"),
    ("energy", "energy"),
    ("retail", "retail"),
]

DEFAULT_SEEDS = ["Apple", "Microsoft", "Amazon", "Alphabet", "JPMorgan Chase"]


def _collapse(s: str) -> str:
    """Lowercase and strip vowels + non-alphanumerics for fuzzy matching."""
    return "".join(ch for ch in s.lower() if ch.isalpha() and ch not in "aeiou0123456789")


# Short / ambiguous abbreviations that must match the WHOLE input exactly —
# never as a substring (e.g. "ai" must not match "retail", "it" must not match
# "fintech"). Checked by equality only.
_EXACT_ALIASES = {
    "ai": "artificial intelligence",
    "ml": "artificial intelligence",
    "genai": "artificial intelligence",
    "llm": "artificial intelligence",
    "ehr": "health it",
    "emr": "health it",
    "health it": "health it",
    # Digital health / health tech (the search that used to return OTC shells).
    "health tech": "digital health",
    "healthtech": "digital health",
    "health technology": "digital health",
    "digital health": "digital health",
    "digital medicine": "digital health",
    "digital therapeutics": "digital health",
    "ehealth": "digital health",
    "e-health": "digital health",
    "mhealth": "digital health",
    "m-health": "digital health",
    "connected health": "digital health",
    "wearables health": "digital health",
    # Other common "-tech" compounds → their correct curated sector, so they
    # never fall through to junk discovery or the broad "technology" bucket.
    "med tech": "medtech",
    "medtech": "medtech",
    "cleantech": "climate tech",
    "clean tech": "climate tech",
    "greentech": "climate tech",
    "green tech": "climate tech",
    "climatetech": "climate tech",
    "agtech": "ag-bio",
    "ag tech": "ag-bio",
    "agritech": "ag-bio",
    "big tech": "technology",
    "social media": "social media",
    "social network": "social media",
    "social networking": "social media",
    # Consumer electronics / product categories
    "laptops": "consumer electronics",
    "laptop": "consumer electronics",
    "computers": "consumer electronics",
    "computer": "consumer electronics",
    "personal computers": "consumer electronics",
    "personal computer": "consumer electronics",
    "pcs": "consumer electronics",
    "smartphones": "consumer electronics",
    "smartphone": "consumer electronics",
    "phones": "consumer electronics",
    "tablets": "consumer electronics",
    "tablet": "consumer electronics",
    "electronics": "consumer electronics",
    "consumer electronics": "consumer electronics",
    "wearables": "consumer electronics",
    "tvs": "consumer electronics",
    "televisions": "consumer electronics",
    # Gaming
    "gaming": "gaming",
    "video games": "gaming",
    "video game": "gaming",
    "esports": "gaming",
    "game consoles": "gaming",
    # Streaming
    "streaming": "streaming",
    "streaming services": "streaming",
    "shoes": "shoes",
    "footwear": "footwear",
    "sneakers": "footwear",
    "biotechnology": "biotech",
    "pharma": "pharmaceutical",
    "health care": "healthcare",
    "healthcare": "healthcare",
    "health": "healthcare",
    "financial services": "finance",
    "financial service": "finance",
    "financial": "finance",
    "financials": "finance",
    "banking": "finance",
    "information technology": "technology",
    "information tech": "technology",
    # Short, unambiguous shorthands.
    "fin": "finance",
    "med": "medtech",
    "ev": "automotive",
    "evs": "automotive",
    "iot": "technology",
    "vr": "technology",
    "ar": "technology",
    "chips": "semiconductors",
    "semis": "semiconductors",
    # S&P GICS sector names + common short variants. The full phrases are also
    # SECTOR_SEEDS keys (matched first), so these mainly catch the abbreviations.
    "consumer discretionary": "consumer discretionary",
    "discretionary": "consumer discretionary",
    "consumer staples": "consumer staples",
    "staples": "consumer staples",
    "communication services": "communication services",
    "communications": "communication services",
    "comms": "communication services",
    "utilities": "utilities",
    "utility": "utilities",
    "materials": "materials",
    "chemicals": "materials",
    "chemical": "materials",
    "mining": "materials",
    "metals": "materials",
    "real estate": "real estate",
    "reit": "real estate",
    "reits": "real estate",
    # ── NAICS supersector exact aliases (the Projects UI's full sector names
    # plus common shorthands) ──
    "real estate and rental and leasing": "real estate and rental and leasing",
    "finance and insurance": "finance and insurance",
    "professional and technical services": "professional and technical services",
    "professional services": "professional and technical services",
    "technical services": "professional and technical services",
    "consulting": "professional and technical services",
    "durable goods manufacturing": "durable goods manufacturing",
    "durable goods": "durable goods manufacturing",
    "durable manufacturing": "durable goods manufacturing",
    "nondurable goods manufacturing": "nondurable goods manufacturing",
    "non-durable goods manufacturing": "nondurable goods manufacturing",
    "nondurable goods": "nondurable goods manufacturing",
    "wholesale trade": "wholesale trade",
    "wholesale": "wholesale trade",
    "retail trade": "retail",
    "information": "information",
    "construction": "construction",
    "transportation and warehousing": "transportation and warehousing",
    "transportation": "transportation and warehousing",
    "warehousing": "transportation and warehousing",
    "logistics": "transportation and warehousing",
    "administrative and waste management services": "administrative and waste management services",
    "administrative and waste management": "administrative and waste management services",
    "waste management": "administrative and waste management services",
    "accommodation and food services": "accommodation and food services",
    "accommodation": "accommodation and food services",
    "food services": "accommodation and food services",
    "hospitality": "accommodation and food services",
    "mining and oil extraction": "mining and oil extraction",
    "mining and oil": "mining and oil extraction",
    "oil and gas": "mining and oil extraction",
    "oil & gas": "mining and oil extraction",
    "oil extraction": "mining and oil extraction",
    "agriculture and forestry": "agriculture and forestry",
    "agriculture": "agriculture and forestry",
    "forestry": "agriculture and forestry",
    "educational services": "educational services",
    "education": "educational services",
    "edtech": "educational services",
    "ed tech": "educational services",
    "management of companies": "management of companies",
    "holding companies": "management of companies",
    "conglomerate": "management of companies",
    "conglomerates": "management of companies",
    "arts and entertainment": "arts and entertainment",
    "entertainment": "arts and entertainment",
    "arts": "arts and entertainment",
    "hospitals": "hospitals",
    "hospital": "hospitals",
    "commercial banking": "finance",
    "state and local government": "state and local government",
    "state and local": "state and local government",
    "local government": "state and local government",
    "state government": "state and local government",
    "government": "state and local government",
    "govt": "state and local government",
    "public sector": "state and local government",
    "federal government": "federal government",
    "federal": "federal government",
}


# ── Edit-distance fuzzy matching (robust misspelling tolerance) ───────────────
# Extra single-word synonyms that map cleanly to one canonical sector. These,
# plus the canonical keys themselves, form the candidate vocabulary the fuzzy
# matcher compares a typed term against.
_FUZZY_SYNONYMS = {
    "pharma": "pharmaceutical", "pharmaceuticals": "pharmaceutical",
    "semiconductor": "semiconductors",
    "automobile": "automotive", "automotives": "automotive",
    "insurer": "insurance", "insurances": "insurance",
    "retailer": "retail", "aerospace": "aerospace", "robotics": "robotics",
    "oncology": "oncology", "cybersecurity": "cybersecurity",
    "telecommunications": "telecom", "telecommunication": "telecom",
    "healthcare": "healthcare", "industrials": "industrial",
    "healthtech": "digital health", "ehealth": "digital health",
    # NAICS supersectors — single-word handles so misspellings still route.
    "hospital": "hospitals", "hospitals": "hospitals",
    "agriculture": "agriculture and forestry", "agricultural": "agriculture and forestry",
    "forestry": "agriculture and forestry",
    "education": "educational services", "educational": "educational services",
    "government": "state and local government", "governmental": "state and local government",
    "construction": "construction",
    "transportation": "transportation and warehousing",
    "wholesale": "wholesale trade",
    "entertainment": "arts and entertainment",
}

# Build candidate vocabulary: canonical keys + synonyms. Each entry maps a
# text token/phrase to its canonical sector key.
_FUZZY_VOCAB: dict = {}
for _k in SECTOR_SEEDS:
    _FUZZY_VOCAB[_k] = _k
_FUZZY_VOCAB.update(_FUZZY_SYNONYMS)


def _lev(a: str, b: str) -> int:
    """Damerau (optimal string alignment) edit distance.

    Counts an adjacent-character transposition (a common typo, e.g. "retial"
    for "retail") as a single edit, which lets us use a strict threshold while
    still catching real misspellings.
    """
    if a == b:
        return 0
    m, n = len(a), len(b)
    if not m:
        return n
    if not n:
        return m
    d = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        d[i][0] = i
    for j in range(n + 1):
        d[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[m][n]


def _close(inp: str, cand: str) -> bool:
    """True if `inp` is a near-miss spelling of `cand` (strict)."""
    if abs(len(inp) - len(cand)) > 2:
        return False
    thr = 1 if len(cand) <= 6 else 2 if len(cand) <= 9 else 3
    d = _lev(inp, cand)
    return d <= thr and d / max(1, len(cand)) <= 0.34


def _fuzzy_sector(key: str) -> Optional[str]:
    """Tolerant misspelling match against the candidate vocabulary.

    Tries the whole input against multi/single-word candidates, then each token
    against single-word candidates, picking the closest within a strict edit
    threshold. Returns None for genuinely unknown terms (so niche searches like
    'pasta' still fall through to live SEC discovery).
    """
    best: Optional[str] = None
    best_d = 99
    multi = " " in key
    consider = []
    if len(key) >= 4:
        consider.append(key)
    # Only fuzzy-match longer tokens; short words ("real", "data") are too
    # close to sector names and cause false positives.
    consider.extend(t for t in key.split() if len(t) >= 5 and t != key)
    for term in consider:
        for cand, target in _FUZZY_VOCAB.items():
            # Multi-word candidate only compared to the whole input.
            if " " in cand and term != key:
                continue
            # A qualified multi-word term must not fuzzy-match into a broad
            # bucket (e.g. "consumer electronics" must stay discovery, not
            # become "consumer"). Mirrors the keyword-route broad guard.
            if multi and target in _BROAD_TARGETS:
                continue
            if _close(term, cand):
                d = _lev(term, cand)
                if d < best_d:
                    best_d, best = d, target
    return best


# Generic catch-all sectors. A bare single word ("food", "tech", "energy")
# may map here, but a qualified multi-word term ("pet food", "solar panels",
# "electric vehicle") is too specific to force into a broad bucket — those
# fall through to live SEC discovery, which surfaces the actual niche players
# (Freshpet, First Solar, Rivian) instead of generic megacaps.
_BROAD_TARGETS = {
    "consumer", "retail", "technology", "industrial",
    "energy", "automotive", "climate tech", "software",
}


def canonical_sector(sector: str) -> Optional[str]:
    """Resolve a raw sector string to a canonical SECTOR_SEEDS key, or None.

    Order matters: exact key, then whole-string abbreviations, then keyword
    routes, then (length-guarded) loose containment, then fuzzy skeleton match.

    Returning None is a feature, not a failure: it signals the orchestrator to
    research the term live via SEC EDGAR full-text discovery. So we deliberately
    decline to match a niche, qualified term (e.g. "pet food", "solar panels")
    to a broad curated bucket — discovery yields a far more relevant company set.
    """
    key = (sector or "").lower().strip()
    if not key:
        return None
    if key in SECTOR_SEEDS:
        return key
    if key in _EXACT_ALIASES:
        return _EXACT_ALIASES[key]

    single_token = " " not in key
    for needles, target in _KEYWORD_ROUTES:
        broad = target in _BROAD_TARGETS
        for n in needles:
            nn = n.strip()
            if nn not in key:
                continue
            # Broad catch-alls only fire on a bare single-word input; a
            # multi-word qualifier ("pet food") should be researched live.
            # Specific sectors (insurance, oncology, pharma…) still match on
            # substring, so "car insurance" → insurance is preserved.
            if broad and not single_token:
                continue
            return target

    # Loose containment — single-token inputs only, and never into a broad
    # bucket, so niche multi-word terms keep falling through to discovery.
    if single_token and len(key) >= 4:
        for known in SECTOR_SEEDS:
            if known in _BROAD_TARGETS:
                continue
            if known in key or key in known:
                return known

    # Fuzzy: tolerate misspellings via edit distance against the sector
    # vocabulary (handles "tecnology", "oncolgy", "artifical intelligence", …).
    return _fuzzy_sector(key)


def seeds_for(sector: str, override: Optional[List[str]] = None) -> List[str]:
    if override:
        return override
    canon = canonical_sector(sector)
    return SECTOR_SEEDS.get(canon, DEFAULT_SEEDS) if canon else DEFAULT_SEEDS


def domain_for(sector: str) -> str:
    """Broad domain (health / tech / business / energy) for a raw sector."""
    canon = canonical_sector(sector)
    return SECTOR_DOMAIN.get(canon, "general") if canon else "general"
