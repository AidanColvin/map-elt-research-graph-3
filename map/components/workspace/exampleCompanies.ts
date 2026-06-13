/**
 * The example companies surfaced on the Company Profile page's empty state,
 * grouped by the Fortune 500 technology categories. Clicking any card runs a
 * full deep dive — and because only a handful of companies are hand-curated,
 * the rest stream a live report assembled fresh each time from SEC EDGAR +
 * Wikipedia, so a reused profile is always re-sourced rather than cached stale.
 *
 * Each entry carries just what a card needs: display name, ticker (or
 * "Private"), web domain for the logo, and an accent color for the monogram
 * fallback.
 */

export interface ExampleCompany {
  name: string;
  ticker: string;
  domain: string;
  accent: string;
}

export interface ExampleCategory {
  label: string;
  companies: ExampleCompany[];
}

export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    label: "Internet Services",
    companies: [
      { name: "Amazon", ticker: "AMZN", domain: "amazon.com", accent: "#ff9900" },
      { name: "Alphabet (Google)", ticker: "GOOGL", domain: "abc.xyz", accent: "#4285f4" },
      { name: "Meta Platforms", ticker: "META", domain: "meta.com", accent: "#0866ff" },
      { name: "Uber Technologies", ticker: "UBER", domain: "uber.com", accent: "#000000" },
      { name: "Booking Holdings", ticker: "BKNG", domain: "bookingholdings.com", accent: "#003580" },
      { name: "Expedia Group", ticker: "EXPE", domain: "expediagroup.com", accent: "#1a2b49" },
      { name: "Airbnb", ticker: "ABNB", domain: "airbnb.com", accent: "#ff5a5f" },
      { name: "DoorDash", ticker: "DASH", domain: "doordash.com", accent: "#ff3008" },
      { name: "eBay", ticker: "EBAY", domain: "ebay.com", accent: "#e53238" },
    ],
  },
  {
    label: "Computer Software",
    companies: [
      { name: "Microsoft", ticker: "MSFT", domain: "microsoft.com", accent: "#0078d4" },
      { name: "Oracle", ticker: "ORCL", domain: "oracle.com", accent: "#f80000" },
      { name: "Salesforce", ticker: "CRM", domain: "salesforce.com", accent: "#00a1e0" },
      { name: "Adobe", ticker: "ADBE", domain: "adobe.com", accent: "#fa0f00" },
      { name: "Intuit", ticker: "INTU", domain: "intuit.com", accent: "#236cff" },
      { name: "ServiceNow", ticker: "NOW", domain: "servicenow.com", accent: "#032d42" },
      { name: "Workday", ticker: "WDAY", domain: "workday.com", accent: "#0875e1" },
    ],
  },
  {
    label: "Computers & Hardware",
    companies: [
      { name: "Apple", ticker: "AAPL", domain: "apple.com", accent: "#1d1d1f" },
      { name: "Dell Technologies", ticker: "DELL", domain: "dell.com", accent: "#007db8" },
      { name: "HP Inc.", ticker: "HPQ", domain: "hp.com", accent: "#0096d6" },
      { name: "Hewlett Packard Enterprise", ticker: "HPE", domain: "hpe.com", accent: "#01a982" },
      { name: "Western Digital", ticker: "WDC", domain: "westerndigital.com", accent: "#0046ad" },
      { name: "Super Micro Computer", ticker: "SMCI", domain: "supermicro.com", accent: "#1a7b3f" },
    ],
  },
  {
    label: "Semiconductors & Components",
    companies: [
      { name: "NVIDIA", ticker: "NVDA", domain: "nvidia.com", accent: "#76b900" },
      { name: "Intel", ticker: "INTC", domain: "intel.com", accent: "#0071c5" },
      { name: "Qualcomm", ticker: "QCOM", domain: "qualcomm.com", accent: "#3253dc" },
      { name: "Broadcom", ticker: "AVGO", domain: "broadcom.com", accent: "#cc092f" },
      { name: "Micron Technology", ticker: "MU", domain: "micron.com", accent: "#0061af" },
      { name: "Applied Materials", ticker: "AMAT", domain: "appliedmaterials.com", accent: "#005eb8" },
      { name: "Advanced Micro Devices", ticker: "AMD", domain: "amd.com", accent: "#ed1c24" },
      { name: "Texas Instruments", ticker: "TXN", domain: "ti.com", accent: "#cc0000" },
    ],
  },
  {
    label: "IT Services",
    companies: [
      { name: "IBM", ticker: "IBM", domain: "ibm.com", accent: "#0530ad" },
      { name: "CDW", ticker: "CDW", domain: "cdw.com", accent: "#d6001c" },
      { name: "Cognizant", ticker: "CTSH", domain: "cognizant.com", accent: "#1a4ed8" },
      { name: "Kyndryl", ticker: "KD", domain: "kyndryl.com", accent: "#ff462d" },
      { name: "Leidos", ticker: "LDOS", domain: "leidos.com", accent: "#00263a" },
      { name: "Booz Allen Hamilton", ticker: "BAH", domain: "boozallen.com", accent: "#00a3e0" },
    ],
  },
  {
    label: "Networking & Communications",
    companies: [
      { name: "Cisco Systems", ticker: "CSCO", domain: "cisco.com", accent: "#1ba0d7" },
      { name: "Motorola Solutions", ticker: "MSI", domain: "motorolasolutions.com", accent: "#5c068c" },
    ],
  },
];
