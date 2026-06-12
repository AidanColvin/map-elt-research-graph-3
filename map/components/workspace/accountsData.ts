import type { AccountProfile } from "./accountProfile";

/**
 * Accounts parsed from the UNC "Database load template — Industry company
 * 06012026" source. The template's columns were visually misaligned in the
 * source export, so each report link was matched to its company by the
 * filename in the SharePoint URL (not by row position). Fields absent in the
 * source are left as empty strings rather than invented.
 *
 * Report links are auth-gated UNC SharePoint URLs (sign-in required).
 */

// Shared SharePoint folder prefix for the "Link to report" PDFs.
const RPT =
  "https://adminliveunc.sharepoint.com/:b:/r/sites/UNCInnovateCarolinaIndustryPartnerships-ResearchAnalyticsIntelligence/Shared%20Documents/Partnership%20Inventory%20Profiles%20(due%20June%208)/";

// takes: a filename and its SharePoint share token
// does: assembles the full auth-gated report URL from the shared folder prefix
// returns: the complete "Link to report" URL string
function rpt(file: string, e: string): string {
  return `${RPT}${file}?csf=1&web=1&e=${e}`;
}

// takes: a partial AccountProfile (only the fields present in the source)
// does: fills every missing AccountProfile field with an empty string so the
//       table can render a complete, strictly-typed row for each account
// returns: a fully-populated AccountProfile
function row(p: Partial<AccountProfile>): AccountProfile {
  return {
    account: "",
    companyAliases: "",
    parentAccount: "",
    topIndustrySectorProfile: "",
    secondaryIndustrySectorProfile: "",
    description: "",
    website: "",
    companyStructure: "",
    ownership: "",
    streetAddress: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    approximateEmployees: "",
    approximateRevenue: "",
    keyProducts: "",
    businessSplit: "",
    researchBy: "",
    dateOfResearch: "",
    resources: "",
    linkToReport: "",
    ...p,
  };
}

export const ACCOUNTS: AccountProfile[] = [
  row({
    account: "Amazon Web Services (AWS)",
    companyAliases: "AWS",
    parentAccount: "Amazon",
    topIndustrySectorProfile: "Technology",
    secondaryIndustrySectorProfile: "Cloud / Data",
    description:
      "Amazon Web Services is the public cloud-computing segment of Amazon.com, Inc., based in Seattle, Washington, providing cloud infrastructure, AI platforms, and health data services. Its purpose-built genomics, health AI, and life-sciences cloud services align with UNC's strengths in biomedical informatics, digital health commercialization, and health data research, and UNC already has an active AWS partnership to build on.",
    website: "aws.amazon.com / aws.amazon.com/health",
    companyStructure: "C Corporation",
    ownership: "Public",
    streetAddress: "410 Terry Avenue North",
    city: "Seattle",
    state: "WA",
    zipCode: "98109",
    country: "",
    approximateEmployees: "60,000–80,000",
    approximateRevenue: "$128,730 million",
    keyProducts: "Amazon EC2, Amazon S3, AWS Lambda, Amazon RDS, Amazon DynamoDB",
    resources:
      "Amazon.com, Inc. (2026). FY2025 Form 10-K, SEC. last10k.com/sec-filings/amzn · StockTitan (2026). Amazon AI spending / AWS 20% growth (8-K). · AWS (2025). re:Invent 2025: healthcare and life sciences. · Eshelman Innovation (2022, 2025). UNC-CH and AWS collaboration.",
    linkToReport: rpt("Amazon_Web_Services_(AWS)_Partnership_Profile.pdf", "47XvoE"),
  }),
  row({
    account: "Anthropic",
    companyAliases: "Claude",
    description:
      "Anthropic is a large private (pre-IPO) firm based in San Francisco, California conducting frontier AI research and developing the Claude family of AI models. Its rapid expansion into healthcare and life-sciences AI — including dedicated clinical and biomedical research tooling — aligns with UNC's strengths in biomedical informatics, clinical research infrastructure, and health data science.",
    website: "anthropic.com",
    companyStructure: "C Corporation",
    ownership: "Private",
    city: "San Francisco",
    state: "CA",
    approximateEmployees: "2,300–5,000",
    keyProducts: "Claude",
    resources:
      "Anthropic (2026). Series H: $65B at $965B post-money. · Fortune (2026). Anthropic confidentially files for IPO. · Anthropic (2026). Advancing Claude in healthcare and the life sciences. · BioSpace (2026). $400M Coefficient Bio acquisition. · Fierce Healthcare (2026). Claude for Healthcare.",
    linkToReport: rpt("Anthropic_Partnership_Profile.pdf", "vjBY3C"),
  }),
  row({
    account: "Apple",
    companyAliases: "Apple Inc.",
    description:
      "Apple designs, manufactures, and markets consumer electronics, personal computers, smartphones, tablets, wearables, and software, alongside a fast-growing suite of digital services (music, video, gaming, payments, cloud). Founded in 1976, it has evolved into a tightly integrated ecosystem company with 2.2 billion active devices. Its strategic pivot centers on embedding generative AI natively (Apple Intelligence), multi-agent Siri, and spatial computing via Vision Pro.",
    website: "apple.com",
    city: "Cupertino",
    state: "CA",
    resources:
      "Apple Inc. (2025). FY2025 Form 10-K, SEC. apple.com/investor-relations · Apple AI strategy analyses (2024–2025). · Apple FY2025 earnings & investor materials. · UNC (2021). Apple's move into North Carolina.",
    linkToReport: rpt("Apple_Partnership_Profile.pdf", "jPYNnQ"),
  }),
  row({
    account: "Bayer (AskBio)",
    companyAliases: "AskBio",
    description:
      "The Bayer–AskBio relationship is one of the most commercially significant technology-transfer outcomes in UNC's history. AskBio was co-founded in 2001 by R. Jude Samulski — then director of UNC's Gene Therapy Center — and Xiao Xiao, on adeno-associated virus (AAV) gene-therapy IP from Samulski's UNC lab. UNC's licenses transferred this IP into AskBio, with royalty and equity stakes realized at Bayer's $4 billion acquisition in 2020.",
    website: "bayer.com / askbio.com",
    streetAddress: "20 TW Alexander Dr. #110",
    city: "Durham",
    state: "NC",
    zipCode: "27703",
    resources:
      "NC Biotech Center (2020). AskBio acquired by Bayer. · BioPharma Dive (2020). Bayer/Asklepios deal. · AskBio. The Jude Samulski story. · Bayer AG (2024). Annual Report FY2024. · UNC Gene Therapy Center. Research overview.",
    linkToReport: rpt("Bayer_AskBio_UNC_Partner_Profile.pdf", "m7vIrx"),
  }),
  row({
    account: "BD",
    companyAliases: "Becton, Dickinson and Company",
    description:
      "BD's relationship with UNC spans a vendor/clinical relationship (BACTEC blood-culture systems at McLendon Clinical Labs), an in-kind research contribution (HPV specimen-transport supplies for Gillings), and an ecosystem connection through the Triangle Global Health Consortium. BD's North America R&D headquarters is at Research Triangle Park, under 15 miles from Chapel Hill, with global-health diagnostics overlapping UNC Gillings programs.",
    website: "bd.com",
    city: "Franklin Lakes",
    state: "NJ",
    resources:
      "Becton, Dickinson and Company (2024). Annual Report FY2024. · PMC (2020). HPV self-sampling (BD in-kind). · UNC McLendon Clinical Labs. BD BACTEC. · RTP.org. BD Technologies and Innovation.",
    linkToReport: rpt("BD_UNC_Partner_Profile.pdf", "48J7m8"),
  }),
  row({
    account: "Blue Cross Blue Shield NC",
    companyAliases: "Blue Cross NC",
    description:
      "Blue Cross and Blue Shield of North Carolina is the largest health insurer in the state, a not-for-profit health plan based in Durham serving more than 5 million members. Its statewide footprint, investment in value-based care and food-as-medicine research, and charitable foundation align with UNC strengths in clinical research, population health, and biomedical informatics. UNC Health is already one of its most significant provider partners.",
    website: "bluecrossnc.com / curacor.com",
    streetAddress: "5901 Chapel Hill Rd",
    city: "Durham",
    state: "NC",
    zipCode: "27707",
    resources:
      "Blue Cross NC (2025). Modernized structure announcement. · Business North Carolina (2026). $497M loss, 15% revenue decline. · UNC Health Newsroom (2024–2025). Long-term agreement; food-delivery study.",
    linkToReport: rpt("Blue%20Cross%20Blue%20Shield%20NC.pdf", "o240Ym"),
  }),
  row({
    account: "BMS",
    companyAliases: "Bristol Myers Squibb",
    description:
      "BMS's documented engagement with UNC consists of a single data point — a Perou Lab alumnus serving as Director of Academic Research Collaborations at BMS — but it is revealing. Charles Perou's UNC Lineberger lab developed the intrinsic-subtype classification of breast cancer. BMS's Opdivo/Yervoy checkpoint-immunotherapy franchise overlaps directly with UNC Lineberger's clinical immunotherapy program.",
    website: "bms.com",
    city: "Princeton",
    state: "NJ",
    resources:
      "Bristol Myers Squibb (2024). Annual Report FY2024. · UNC Lineberger. Perou Lab alumni; cellular immunotherapy program. · BMS. Academic research collaborations.",
    linkToReport: rpt("BMS_UNC_Partner_Profile.pdf", "YO5nRG"),
  }),
  row({ account: "Bandwidth", city: "Raleigh", state: "NC" }),
  row({
    account: "Cisco",
    description:
      "Cisco's current formal engagement with UNC is limited to the Cisco AnyConnect VPN site license powering campus-wide secure remote access for all faculty, staff, and students. UNC's research computing, EHR access, and administrative systems route through Cisco's VPN, but this is a vendor relationship rather than a strategic academic partnership; no documented research collaborations or talent-pipeline agreements exist at this time.",
    website: "cisco.com",
    city: "San Jose",
    state: "CA",
    resources:
      "Cisco Systems (2024). Annual Report FY2024. · Cisco Research. University research partnerships. · UNC ITS (2020). VPN access — Cisco AnyConnect. · Cisco (2024). Completes acquisition of Splunk.",
    linkToReport: rpt("Cisco_UNC_Partner_Profile.pdf", "19k9wp"),
  }),
  row({
    account: "Databricks",
    description:
      "Databricks is a large private firm based in San Francisco providing a unified data and AI platform. Its flagship role powering UNC's SHIRE clinical research environment — the most significant health-data infrastructure project in the UNC system — already creates a deep, active relationship with the School of Medicine, NC TraCS Institute, and UNC Health, with runway for sponsored research and open-source collaboration.",
    website: "databricks.com",
    city: "San Francisco",
    state: "CA",
    ownership: "Private",
    resources:
      "UNC Health (2025). New secure cloud computing environment for EHR data. · UNC (2026). SHIRE health care innovation platform. · UNC School of Medicine. SHIRE: About Us. · NC TraCS Institute (2025).",
    linkToReport: rpt("Databricks_Partnership_Profile.pdf", "19gi4K"),
  }),
  row({ account: "Duke Energy", city: "Charlotte", state: "NC" }),
  row({
    account: "Eli Lilly",
    description:
      "Eli Lilly's UNC engagement is at the consortium level: Lilly is a member of the NC Life Sciences Apprenticeship Consortium. UNC participates but is a secondary actor to NC State's BTEC. What changes the calculus is the scale of Lilly's NC commitment — its LEAP campus in Concord (~75 miles from Chapel Hill) is the company's single largest manufacturing investment globally, $9B+ committed, 1,000+ jobs, producing GLP-1 drugs (Mounjaro, Zepbound).",
    website: "lilly.com",
    city: "Indianapolis",
    state: "IN",
    resources:
      "Pharmaceutical Technology. LEAP Concord facility. · NC Biotech Center. BTEC workforce. · Eli Lilly (2024). Annual Report FY2024. · Eli Lilly. LEAP — Advanced Manufacturing.",
    linkToReport: rpt("EliLilly_UNC_Partner_Profile.pdf", "6Hc14H"),
  }),
  row({
    account: "Epic Games",
    description:
      "Epic Games is a large private firm based in Cary, North Carolina developing interactive-entertainment software and 3D engine technology. Its Cary headquarters proximity, active university recruiting, and Unreal Engine academic-program infrastructure align with UNC strengths in computer science, computer-graphics research, and regional talent development.",
    website: "epicgames.com",
    city: "Cary",
    state: "NC",
    ownership: "Private",
    keyProducts: "Unreal Engine, Fortnite, Epic Games Store",
    resources:
      "Epic Games (2024). Company overview. · CB Insights (2024). Disney invests $1.5B at $22.5B valuation. · Epic Games (2025). Academic Partner Program. · UNC CS. Computer graphics research.",
    linkToReport: rpt("Epic_Games_Partnership_Profile.pdf", "PyCROc"),
  }),
  row({
    account: "Eshelman Institute for Innovation",
    companyAliases: "EII",
    parentAccount: "UNC Eshelman School of Pharmacy",
    description:
      "The Eshelman Institute for Innovation (EII) is an internal UNC-affiliated entity funded by a philanthropic gift from Fred Eshelman, PharmD, to the Eshelman School of Pharmacy. It is a UNC-internal innovation funding and venture-creation engine whose programs complement Innovate Carolina's mission rather than a traditional external partner.",
    website: "eshelmaninnovation.org",
    city: "Chapel Hill",
    state: "NC",
    resources:
      "Eshelman Institute for Innovation. About EII; Therapeutics Accelerator; Venture Studio; Impact report. · UNC News (2024). Eshelman Innovation begins its second decade.",
    linkToReport: rpt("Google_Partnership_Profile.pdf", "6KDubq"),
  }),
  row({
    account: "Fred Eshelman",
    description:
      "Fred Eshelman is profiled as an individual philanthropist and strategic advisor — not a corporate partner. His relationship with UNC is personal, decades-long, and operates at the highest levels of institutional governance. Engagement should be coordinated through UNC's University Development office and the Eshelman School of Pharmacy Dean's office.",
    city: "Chapel Hill",
    state: "NC",
    resources:
      "UNC Eshelman Institute. Fred Eshelman bio. · UNC News (2014). $100M commitment to Eshelman School of Pharmacy. · UNC Campaign. Innovation liftoff.",
    linkToReport: rpt("IBM_UNC_Partner_Profile.pdf", "R7ZPUP"),
  }),
  row({
    account: "Google",
    companyAliases: "Alphabet",
    parentAccount: "Alphabet Inc.",
    description:
      "Google is a large public multinational based in Mountain View, California performing internet services, cloud computing, and AI R&D. Its heavy investment in health-AI models and AI-augmented scientific discovery aligns with UNC's strengths in biomedical informatics, AI-driven research infrastructure, and health data science.",
    website: "google.com / research.google",
    city: "Mountain View",
    state: "CA",
    ownership: "Public",
    resources:
      "Alphabet Inc. (2026). Q1 2026 earnings (8-K), SEC. · Google Research (2025–2026). MedGemma; Research at I/O 2026. · Google for Education. UNC Chapel Hill medical imaging with Google Cloud.",
    linkToReport: rpt("Leidos_Partnership_Profile.pdf", "MjTsmB"),
  }),
  row({
    account: "Golden LEAF Foundation",
    description:
      "The Golden LEAF Foundation is one of North Carolina's most important philanthropic institutions and one of UNC's most mission-aligned funders. Created in 1999 from NC's tobacco-settlement share, it has distributed over $900 million across thousands of grants. Its priorities in rural workforce development, healthcare access, STEM education, and agricultural innovation map onto UNC's strongest programs.",
    website: "goldenleaf.org",
    city: "Rocky Mount",
    state: "NC",
    resources:
      "Golden LEAF Foundation. About; Local Government Training Initiative; Grantmaking priorities. · UNC School of Government. CPLG Local Government Training Initiative.",
    linkToReport: rpt("GoldenLEAF_UNC_Partner_Profile.pdf", "d6C3m9"),
  }),
  row({
    account: "IBM",
    description:
      "IBM's documented UNC engagement is primarily historical. The most significant on-record contribution is a foundational gift — $100,000 split among UNC, Duke, and NC State — at the request of Frederick Brooks, the UNC computer scientist who founded the CS department. No active named UNC-Chapel Hill engagement is documented recently; IBM's current NC footprint (the IBM Quantum Hub) is centered on NC State.",
    website: "ibm.com / ibm.com/research",
    city: "Armonk",
    state: "NY",
    resources:
      "UNC CS. Remembering Dr. Frederick P. Brooks Jr. · IBM (2024). Annual Report FY2024. · IBM Quantum. Quantum Network. · IBM (2019). Closes acquisition of Red Hat.",
    linkToReport: rpt("Lenovo_UNC_Partner_Profile.pdf", "TZ67oe"),
  }),
  row({
    account: "GSK",
    parentAccount: "GSK plc",
    description:
      "GSK's UNC relationship is not yet well-documented publicly, but structural conditions are exceptionally strong. GSK operates one of its largest global R&D campuses at Research Triangle Park (under 20 miles from Chapel Hill), and its majority-owned ViiV Healthcare — the world's leading HIV pharma company — is also at RTP. UNC's HIV Cure Center, CFAR, and Infectious Disease faculty form a premier academic HIV research ecosystem.",
    website: "gsk.com / gsk.com/en-gb/research/",
    city: "London",
    country: "UK",
    resources:
      "GSK plc (2024). Annual Report FY2024. · ViiV Healthcare. About; HIV cure research. · GSK. Research Triangle Park. · UNC HIV Cure Center. CARE Collaboratory. · READDI. About.",
    linkToReport: rpt("GSK_UNC_Partner_Profile.pdf", "IXn0Xu"),
  }),
  row({
    account: "Hatteras Venture Partners",
    description:
      "Hatteras Venture Partners is the Research Triangle's most active early-stage life-sciences venture firm and one of the most consistent investors in UNC spinouts. It converts UNC IP into fundable companies and funds them — backing Argos Therapeutics (UNC Lineberger) and G1 Therapeutics (UNC Sharpless lab), with several partners (including Bob Ingram) holding deep UNC ties.",
    website: "hatterasvp.com",
    city: "Durham",
    state: "NC",
    resources:
      "Hatteras Venture Partners. About; Portfolio. · NC Biotech Center. Hatteras profile. · G1 Therapeutics (2024). Merck acquires G1.",
    linkToReport: rpt("Hatteras_UNC_Partner_Profile.pdf", "S2NZpk"),
  }),
  row({
    account: "IQVIA",
    description:
      "IQVIA traces directly to Dennis Gillings, a UNC biostatistics professor who founded Quintiles in 1982 from his Chapel Hill home. Quintiles grew into the world's largest CRO; Gillings's naming gift created the Gillings School of Global Public Health. The Durham-headquartered company (under 12 miles from Chapel Hill) retains UNC connections through a biostatistics recruiting pipeline, an adjunct appointment, and its CRO role at UNC Health.",
    website: "iqvia.com / iqvia.com/solutions/research-and-development",
    city: "Durham",
    state: "NC",
    resources:
      "IQVIA Holdings (2024). Annual Report FY2024. · UNC Gillings. Biostatistics employer partners; Christina Mack adjunct appointment. · NC TraCS. About.",
    linkToReport: rpt("IQVIA_UNC_Partner_Profile.pdf", "6wFU7v"),
  }),
  row({
    account: "Johnson & Johnson",
    companyAliases: "J&J, Janssen",
    description:
      "Johnson & Johnson's UNC relationship is multi-threaded: pharmaceutical R&D collaboration (Janssen/Altis Biosystems intestinal-organoid platform), clinical-trial network participation (HIV ACTG/HPTN trials), trainee fellowships (Janssen industry fellowships at Eshelman), and a $2B NC biomanufacturing investment. The Janssen–Altis–UNC collaboration is the most institutionally documented engagement.",
    website: "jnj.com / janssen.com / jnjinnovation.com",
    city: "New Brunswick",
    state: "NJ",
    resources:
      "Johnson & Johnson (2024). Annual Report FY2024. · Altis Biosystems. Janssen R&D with UNC case study. · UNC Eshelman. Janssen industry fellowships. · NC Biotech. J&J $2B NC commitment.",
    linkToReport: rpt("JohnsonJohnson_UNC_Partner_Profile.pdf", "Evo9ds"),
  }),
  row({
    account: "Labcorp",
    description:
      "Labcorp is a large public diagnostics and laboratory-services company (NYSE: LH) headquartered in Burlington, North Carolina, operating one of the world's largest clinical laboratory networks and a global biopharma/central-laboratory business. As an in-state NC company, its diagnostics, central-laboratory, and biopharma testing capabilities align with UNC strengths in clinical research, trial infrastructure, and health data science.",
    website: "labcorp.com",
    city: "Burlington",
    state: "NC",
    ownership: "Public",
    linkToReport: rpt("Labcorp_Profile_6_9_2026.pdf", "XBHvlq"),
  }),
  row({
    account: "Leidos",
    description:
      "Leidos is a large public firm based in Reston, Virginia providing technology and engineering services for national security, defense, and healthcare. Its Strategic University Alliances program — funding jointly defined research agendas at 10 peer institutions — has not yet included UNC-Chapel Hill, despite UNC's strengths in AI/ML, cybersecurity, health informatics, and public policy.",
    website: "leidos.com",
    city: "Reston",
    state: "VA",
    ownership: "Public",
    linkToReport: rpt("Leidos_Partnership_Profile.pdf", "SWegHO"),
  }),
  row({
    account: "Lenovo",
    description:
      "Lenovo's US operations are headquartered in Morrisville, North Carolina, placing a major global technology manufacturer within the Research Triangle adjacent to UNC.",
    website: "lenovo.com",
    city: "Morrisville",
    state: "NC",
    linkToReport: rpt("Meta_Partnership_Profile.pdf", "FIKd9j"),
  }),
  row({
    account: "Lockheed Martin",
    topIndustrySectorProfile: "Aerospace & Defense",
    linkToReport: rpt("Microsoft_Partnership_Profile.pdf", "k7YntB"),
  }),
  row({
    account: "Merck",
    description:
      "Merck's relationship with UNC-Chapel Hill is substantive, multi-threaded, and primarily PI-driven — the most important engagements are scientist-to-scientist collaborations that predate and operate independently of any institutional partnership framework. This is both a strength (deep scientific credibility) and a structural gap (no coordinating umbrella or institutional visibility).",
    website: "merck.com",
    city: "Rahway",
    state: "NJ",
    linkToReport: rpt("Merck_UNC_Partner_Profile.pdf", "5f2peS"),
  }),
  row({
    account: "NC Commerce",
    companyAliases: "The NC Department of Commerce",
    description:
      "The NC Department of Commerce is one of UNC's most important state-government partners, central to economic development, workforce, and industry-recruitment efforts across North Carolina.",
    website: "commerce.nc.gov",
    streetAddress: "301 N. Wilmington Street",
    city: "Raleigh",
    state: "NC",
    zipCode: "27601",
    linkToReport: rpt("NCCommerce_UNC_Partner_Profile.pdf", "LiDAUI"),
  }),
  row({
    account: "Meta",
    description:
      "Meta is a large public firm based in Menlo Park, California operating social platforms and investing heavily in AI research and open models.",
    website: "meta.com",
    city: "Menlo Park",
    state: "CA",
    ownership: "Public",
    linkToReport: rpt("NVIDIA_Partnership_Profile.pdf", "F43erM"),
  }),
  row({
    account: "Microsoft",
    description:
      "Microsoft is a large public multinational based in Redmond, Washington performing software development, cloud computing, and AI research and platforms. Its heavy investment in clinical AI assistants and health-data platforms aligns with UNC's strengths in biomedical informatics, AI-enabled research computing, and health data science.",
    website: "microsoft.com / microsoft.com/research",
    city: "Redmond",
    state: "WA",
    ownership: "Public",
    linkToReport: rpt("Microsoft_Partnership_Profile.pdf", "XiSJJk"),
  }),
  row({
    account: "NVIDIA",
    description:
      "NVIDIA is a large public firm based in Santa Clara, California performing accelerated computing, GPU design, and AI-platform development. Its heavy investment in AI-driven biology and drug discovery (BioNeMo, Clara open models, a $1B co-innovation lab with Eli Lilly) aligns with UNC's strengths in biomedical informatics, high-performance computing, and health data research.",
    website: "nvidia.com / developer.nvidia.com/higher-education-and-research",
    city: "Santa Clara",
    state: "CA",
    ownership: "Public",
    keyProducts: "BioNeMo, Clara, CUDA, GPU accelerators",
    linkToReport: rpt("Oracle_Partnership_Profile.pdf", "4VilOX"),
  }),
  row({
    account: "NCDHHS",
    companyAliases: "NC Department of Health and Human Services",
    description:
      "NC DHHS is the largest and most mission-aligned state-government partner in UNC's ecosystem. Its mandate — improving health outcomes for North Carolina's 10+ million residents — is inseparable from UNC's public health, medicine, pharmacy, and social-work research, spanning a dozen-plus UNC units through contracts, research collaborations, data-sharing agreements, and policy advisory roles.",
    website: "ncdhhs.gov",
    city: "Raleigh",
    state: "NC",
    linkToReport: rpt("NCDHHS_UNC_Partner_Profile.pdf", "bX1RQJ"),
  }),
  row({
    account: "OpenAI",
    description:
      "OpenAI is a large private (pre-IPO) firm based in San Francisco, California developing frontier AI models and products, with growing investment in healthcare and scientific applications relevant to UNC research.",
    website: "openai.com",
    city: "San Francisco",
    state: "CA",
    ownership: "Private",
    linkToReport: rpt("OpenAI_Partnership_Profile.pdf", "0so8wa"),
  }),
  row({
    account: "Oracle",
    description:
      "Oracle is a large public firm based in Austin, Texas providing enterprise software, cloud infrastructure, and database technology. Its deep investment in healthcare IT (EHR, clinical AI, real-world data) and AI/cloud infrastructure aligns with UNC's strengths in health-sciences research, biomedical informatics, and data-intensive computing — and Oracle already operates as UNC's core ERP vendor through PeopleSoft.",
    website: "oracle.com",
    city: "Austin",
    state: "TX",
    ownership: "Public",
    linkToReport: rpt("RedHat_IBM_UNC_Partner_Profile.pdf", "XvL3qS"),
  }),
  row({
    account: "Pfizer",
    parentAccount: "Pfizer Inc.",
    description:
      "Pfizer Inc. is a large public biopharmaceutical company developing vaccines and therapeutics across oncology, immunology, and infectious disease, with research areas that overlap UNC's clinical and translational programs.",
    website: "pfizer.com",
    city: "New York",
    state: "NY",
    ownership: "Public",
    linkToReport: rpt("Pfizer_Profile_6_9_2026.pdf", "qNNHMe"),
  }),
  row({
    account: "Palantir Technologies",
    topIndustrySectorProfile: "Technology",
    secondaryIndustrySectorProfile: "Data / Analytics",
    ownership: "Public",
    linkToReport: rpt("Salesforce_Partnership_Profile.pdf", "yrNeIU"),
  }),
  row({
    account: "Red Hat (IBM)",
    parentAccount: "IBM",
    description:
      "Red Hat's formal documented engagement with UNC consists primarily of open-source software relationships. Headquartered in Raleigh, it is a major Research Triangle employer and a leading enterprise open-source vendor, now an IBM subsidiary.",
    website: "redhat.com / ibm.com/redhat",
    city: "Raleigh",
    state: "NC",
    linkToReport: rpt("SAS_Institute_UNC_Partner_Profile.pdf", "53M9cQ"),
  }),
  row({
    account: "Salesforce",
    description:
      "Salesforce is a large public firm based in San Francisco providing enterprise CRM, cloud platform, and AI-powered business software. Its Education Cloud and Agentforce for Higher Education products, Academia Centers of Excellence model, and $1B AI investment fund align with UNC's strengths in innovation-ecosystem management, business education, and enterprise data — and it is already embedded across two UNC units.",
    website: "salesforce.com",
    city: "San Francisco",
    state: "CA",
    ownership: "Public",
    linkToReport: rpt("Snowflake_Partnership_Profile.pdf", "0KVVb3"),
  }),
  row({
    account: "SAS Institute",
    description:
      "SAS Institute is one of the most geographically proximate and historically connected corporate neighbors to UNC, headquartered in Cary, North Carolina. A privately held analytics-software leader, it has long ties to NC's statistics and data-science talent pipeline.",
    website: "sas.com",
    city: "Cary",
    state: "NC",
    ownership: "Private",
    linkToReport: rpt("Splunk_Cisco_UNC_Partner_Profile.pdf", "4cXuMP"),
  }),
  row({
    account: "Snowflake",
    description:
      "Snowflake is a large public firm providing a cloud-based AI Data Cloud platform for data warehousing, data science, and enterprise AI. Its AI research division, healthcare-data focus, FedRAMP-authorized infrastructure, and active venture arm (42+ deals since 2024) align with UNC's strengths in data science, health informatics, and research commercialization, despite a current near-zero direct engagement footprint.",
    website: "snowflake.com",
    city: "San Francisco",
    state: "CA",
    ownership: "Public",
    linkToReport: rpt("Snowflake_Partnership_Profile.pdf", "ceIAHB"),
  }),
  row({
    account: "Splunk (Cisco)",
    parentAccount: "Cisco",
    description:
      "UNC-Chapel Hill's relationship with Splunk is among the university's significant security-and-observability software relationships. Now a Cisco company, Splunk provides data analytics for security and operations used across enterprise IT environments.",
    website: "splunk.com / cisco.com/splunk",
    city: "Fort Detrick, Frederick",
    state: "MD",
    linkToReport: rpt("Splunk_Cisco_UNC_Partner_Profile.pdf", "H4oJeG"),
  }),
  row({
    account: "USAMRDC",
    companyAliases: "U.S. Army Medical Research and Development Command",
    description:
      "USAMRDC's relationship with UNC is substantive and multi-threaded, spanning federally funded medical research across infectious disease, trauma, and biomedical programs that align with UNC's School of Medicine and Gillings research strengths.",
    website: "usamrdc.army.mil",
    topIndustrySectorProfile: "Government",
    secondaryIndustrySectorProfile: "Defense / Health",
    linkToReport: rpt("USAMRDC_UNC_Partner_Profile.pdf", "Xdltbv"),
  }),
];
