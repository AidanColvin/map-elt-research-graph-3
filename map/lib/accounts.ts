/**
 * Accounts database — strict model plus the dataset parsed from the
 * "Database load template - Industry company 06012026" sheet (UNC Innovate
 * Carolina partnership inventory). Every field is a string; unknown cells are
 * empty strings so the table renders uniformly.
 */

export interface AccountProfile {
  account: string;
  companyAliases: string;
  parentAccount: string;
  topIndustrySectorProfile: string;
  secondaryIndustrySectorProfile: string;
  description: string;
  website: string;
  companyStructure: string;
  ownership: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  approximateEmployees: string;
  approximateRevenue: string;
  keyProducts: string;
  businessSplit: string;
  researchBy: string;
  dateOfResearch: string;
  resources: string;
  linkToReport: string;
}

/** Column order and labels exactly as in the load template. */
export const ACCOUNT_COLUMNS: { key: keyof AccountProfile; label: string }[] = [
  { key: "account", label: "Account" },
  { key: "companyAliases", label: "Company Aliases" },
  { key: "parentAccount", label: "Parent Account" },
  { key: "topIndustrySectorProfile", label: "Top Industry Sector Profile" },
  { key: "secondaryIndustrySectorProfile", label: "Secondary Industry Sector Profile" },
  { key: "description", label: "Description" },
  { key: "website", label: "Website" },
  { key: "companyStructure", label: "Company Structure" },
  { key: "ownership", label: "Ownership" },
  { key: "streetAddress", label: "Street Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zipCode", label: "Zip code" },
  { key: "country", label: "Country" },
  { key: "approximateEmployees", label: "Approximate Employees" },
  { key: "approximateRevenue", label: "Approximate Revenue" },
  { key: "keyProducts", label: "Key Products" },
  { key: "businessSplit", label: "Business Split" },
  { key: "researchBy", label: "Research by" },
  { key: "dateOfResearch", label: "Date of Research" },
  { key: "resources", label: "Resources" },
  { key: "linkToReport", label: "Link to report" },
];

// takes: a profile PDF filename and its SharePoint share token
// does: builds the full UNC SharePoint "Link to report" URL shared by every
//       row of the load template
// returns: the absolute report URL string
function sp(file: string, e: string): string {
  return (
    "https://adminliveunc.sharepoint.com/:b:/r/sites/UNCInnovateCarolinaIndustryPartnerships-ResearchAnalyticsIntelligence/" +
    "Shared%20Documents/Partnership%20Inventory%20Profiles%20(due%20June%208)/" +
    `${file}?csf=1&web=1&e=${e}`
  );
}

// takes: a partial profile containing only the fields the sheet provided
// does: fills every remaining AccountProfile field with an empty string so
//       each row is complete and the table renders uniformly
// returns: a fully populated AccountProfile
function row(p: Partial<AccountProfile> & { account: string }): AccountProfile {
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
    account: "Amazon",
    companyAliases: "Amazon.com",
    topIndustrySectorProfile: "Technology",
    secondaryIndustrySectorProfile: "Retail",
    website: "amazon.com",
    companyStructure: "C Corporation",
  }),
  row({
    account: "Amazon Web Services (AWS)",
    companyAliases: "AWS",
    parentAccount: "Amazon",
    topIndustrySectorProfile: "Data",
    description:
      "Amazon Web Services is the large public cloud-computing segment of Amazon.com, Inc., based in Seattle, Washington, that performs cloud infrastructure, AI platforms, and health data services. They offer a potential partnership because their purpose-built genomics, health AI, and life-sciences cloud services align directly with UNC's strength in biomedical informatics, digital health commercialization, and health data research and because UNC already has an active AWS partnership to build on.",
    website: "aws.amazon.com / aws.amazon.com/health",
    companyStructure: "C Corporation",
    ownership: "Public",
    streetAddress: "410 Terry Avenue North",
    city: "Seattle",
    state: "WA",
    zipCode: "98109",
    approximateEmployees: "60,000–80,000",
    approximateRevenue: "$128,730 million",
    keyProducts: "Amazon EC2, Amazon S3, AWS Lambda, Amazon RDS, Amazon DynamoDB",
    resources:
      "Amazon.com, Inc. (2026). Annual report FY2025 (Form 10-K), SEC • StockTitan (2026). Amazon boosts AI spending as 2025 revenue hits $717B and AWS grows 20% • AWS (2025). AWS re:Invent 2025: A transformative moment for healthcare and life sciences • Eshelman Innovation (2022). EI spearheads UNC-CH and AWS collaboration • Eshelman Innovation (2025). UNC to launch AI-driven venture creation platform on AWS",
    linkToReport: sp("Amazon_Web_Services_(AWS)_Partnership_Profile.pdf", "47XvoE"),
  }),
  row({
    account: "Anthropic",
    companyAliases: "Claude",
    description:
      "Anthropic is a large private (pre-IPO) firm based in San Francisco, California that performs frontier AI research and develops the Claude family of AI models. They offer a potential partnership because their rapid expansion into healthcare and life sciences AI — including dedicated clinical and biomedical research tooling — aligns directly with UNC's strength in biomedical informatics, clinical research infrastructure, and health data science.",
    website: "anthropic.com",
    companyStructure: "C Corporation",
    ownership: "Private",
    city: "San Francisco",
    state: "CA",
    approximateEmployees: "2,300–5,000",
    keyProducts: "Claude",
    resources:
      "Anthropic (2026). Anthropic raises $65B in Series H at $965B post-money valuation • Fortune (2026). Anthropic confidentially files for IPO • Anthropic (2026). Advancing Claude in healthcare and the life sciences • BioSpace (2026). Anthropic leans into life sciences with $400M Coefficient Bio catch • Fierce Healthcare (2026). JPM26: Anthropic launches Claude for Healthcare • Anthropic (n.d.). AI for Science program",
    linkToReport: sp("Anthropic_Partnership_Profile.pdf", "vjBY3C"),
  }),
  row({
    account: "Apple",
    description:
      "Apple Inc. designs, manufactures, and markets consumer electronics, personal computers, smartphones, tablets, wearables, and software, alongside a fast-growing suite of digital services including music, video streaming, gaming, payments, and cloud storage. Founded in 1976, Apple has evolved from a hardware innovator into a tightly integrated ecosystem company with 2.2 billion active devices worldwide. The company's current strategic pivot centers on embedding generative AI natively across its product lineup (Apple Intelligence), building toward multiagent Siri capabilities, and staking a leading position in spatial computing through Apple Vision Pro. Apple's business model is distinguished by its premium hardware installed base anchored by the iPhone (over 50% of revenue) and a Services segment now generating $109B annually at a 75.4% gross margin…",
    website: "apple.com",
    city: "Cupertino",
    state: "CA",
    resources:
      "Apple Inc. (2025). Form 10-K FY2025, SEC • Analyzing Apple's AI strategy (2024) • The AI Sovereign: Deep-Dive Analysis of Apple Inc. (2025) • Deep Dive Analysis: Apple Inc., The Boring Finance Guy (2025) • Apple FY2025 earnings and investor materials • Apple hiring data (2026), LinkedIn Talent Insights • Crunchbase / PitchBook deal records (2025–2026) • UNC Chapel Hill (2021). University and state to benefit from Apple's move into North Carolina • ABC11 (2024)",
    linkToReport: sp("Apple_Partnership_Profile.pdf", "jPYNnQ"),
  }),
  row({
    account: "Bayer",
    companyAliases: "AskBio",
    description:
      "The Bayer–AskBio relationship with UNC is one of the most commercially significant technology transfer outcomes in UNC's history. AskBio was co-founded in 2001 by R. Jude Samulski — then director of UNC's Gene Therapy Center — and Xiao Xiao, based on adeno-associated virus (AAV) gene therapy intellectual property originating in Samulski's UNC laboratory. UNC