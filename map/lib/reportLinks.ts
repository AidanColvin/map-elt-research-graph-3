/**
 * reportLinks.ts  (SERVER ONLY)
 * The real, auth-gated SharePoint URLs for partnership report PDFs.
 *
 * These URLs — including their `?e=` share tokens — used to live in
 * accountsData.ts, which is imported by client components and therefore
 * compiled into the public JS bundle. An anonymous GET of a /_next chunk
 * returned every internal URL. That was a confirmed breach.
 *
 * Now the browser only ever sees an opaque id (`/api/report-link?r=<id>`). This
 * module maps that id to the true URL and NEVER reaches the client — the
 * `server-only` import makes a client import a build error. The URL is handed
 * out solely by /api/report-link, and solely to an approved caller.
 */

interface ReportRef {
  file: string;
  e: string;
}

// The shared SharePoint folder prefix. Server-side only.
const BASE =
  "https://adminliveunc.sharepoint.com/:b:/r/sites/UNCInnovateCarolinaIndustryPartnerships-ResearchAnalyticsIntelligence/Shared%20Documents/Partnership%20Inventory%20Profiles%20(due%20June%208)/";

const REPORTS: Record<string, ReportRef> = {
  "a84aeda3c5": { file: "Amazon_Web_Services_(AWS)_Partnership_Profile.pdf", e: "47XvoE" },
  "e27a8ba71a": { file: "Anthropic_Partnership_Profile.pdf", e: "vjBY3C" },
  "e22c62bc1f": { file: "Apple_Partnership_Profile.pdf", e: "jPYNnQ" },
  "693d8fa6e6": { file: "Bayer_AskBio_UNC_Partner_Profile.pdf", e: "m7vIrx" },
  "3afdb1fbdc": { file: "BD_UNC_Partner_Profile.pdf", e: "48J7m8" },
  "b977b22d81": { file: "Blue%20Cross%20Blue%20Shield%20NC.pdf", e: "o240Ym" },
  "bca0eff80c": { file: "BMS_UNC_Partner_Profile.pdf", e: "YO5nRG" },
  "2c1e287930": { file: "Cisco_UNC_Partner_Profile.pdf", e: "19k9wp" },
  "31c1fbb96a": { file: "Databricks_Partnership_Profile.pdf", e: "19gi4K" },
  "2ea96a0c4f": { file: "EliLilly_UNC_Partner_Profile.pdf", e: "6Hc14H" },
  "1a3300ab56": { file: "Epic_Games_Partnership_Profile.pdf", e: "PyCROc" },
  "6d32dfbe4c": { file: "Google_Partnership_Profile.pdf", e: "6KDubq" },
  "18be74ba43": { file: "IBM_UNC_Partner_Profile.pdf", e: "R7ZPUP" },
  "85ab45614b": { file: "Leidos_Partnership_Profile.pdf", e: "MjTsmB" },
  "2dfe5259fc": { file: "GoldenLEAF_UNC_Partner_Profile.pdf", e: "d6C3m9" },
  "3fe3df9fc0": { file: "Lenovo_UNC_Partner_Profile.pdf", e: "TZ67oe" },
  "81d0e6b961": { file: "GSK_UNC_Partner_Profile.pdf", e: "IXn0Xu" },
  "06e2aa370d": { file: "Hatteras_UNC_Partner_Profile.pdf", e: "S2NZpk" },
  "f8d5f8708a": { file: "IQVIA_UNC_Partner_Profile.pdf", e: "6wFU7v" },
  "85a2feecdf": { file: "JohnsonJohnson_UNC_Partner_Profile.pdf", e: "Evo9ds" },
  "a570367d13": { file: "Labcorp_Profile_6_9_2026.pdf", e: "XBHvlq" },
  "9fa975660e": { file: "Leidos_Partnership_Profile.pdf", e: "SWegHO" },
  "17274fd9fa": { file: "Meta_Partnership_Profile.pdf", e: "FIKd9j" },
  "8c93d69efe": { file: "Microsoft_Partnership_Profile.pdf", e: "k7YntB" },
  "6dbdf711f3": { file: "Merck_UNC_Partner_Profile.pdf", e: "5f2peS" },
  "086383f198": { file: "NCCommerce_UNC_Partner_Profile.pdf", e: "LiDAUI" },
  "877295c981": { file: "NVIDIA_Partnership_Profile.pdf", e: "F43erM" },
  "9628a8546d": { file: "Microsoft_Partnership_Profile.pdf", e: "XiSJJk" },
  "41b646dd0b": { file: "Oracle_Partnership_Profile.pdf", e: "4VilOX" },
  "e41ce7472a": { file: "NCDHHS_UNC_Partner_Profile.pdf", e: "bX1RQJ" },
  "503705a0bd": { file: "OpenAI_Partnership_Profile.pdf", e: "0so8wa" },
  "5ecce28185": { file: "RedHat_IBM_UNC_Partner_Profile.pdf", e: "XvL3qS" },
  "062e2dfba5": { file: "Pfizer_Profile_6_9_2026.pdf", e: "qNNHMe" },
  "9693af4dcb": { file: "Salesforce_Partnership_Profile.pdf", e: "yrNeIU" },
  "20ec35fcee": { file: "SAS_Institute_UNC_Partner_Profile.pdf", e: "53M9cQ" },
  "ef2333b474": { file: "Snowflake_Partnership_Profile.pdf", e: "0KVVb3" },
  "ec8795a6b3": { file: "Splunk_Cisco_UNC_Partner_Profile.pdf", e: "4cXuMP" },
  "be9f636a0c": { file: "Snowflake_Partnership_Profile.pdf", e: "ceIAHB" },
  "8108c8c035": { file: "Splunk_Cisco_UNC_Partner_Profile.pdf", e: "H4oJeG" },
  "93c098eb99": { file: "USAMRDC_UNC_Partner_Profile.pdf", e: "Xdltbv" }
};

// Guard against this module ever being pulled into a client bundle. Only the
// server route /api/report-link imports it; if a browser ever evaluates it, the
// internal URLs would be exposed, so refuse loudly instead. (This replaces the
// `server-only` package, which is not a dependency here.)
if (typeof window !== "undefined") {
  throw new Error("reportLinks.ts is server-only and must never run in the browser.");
}

// takes: an opaque report id from the client
// does: resolves it to the true auth-gated SharePoint URL
// returns: the URL, or null when the id is unknown
export function reportUrlFor(id: string): string | null {
  const ref = REPORTS[id];
  if (!ref) return null;
  return `${BASE}${ref.file}?csf=1&web=1&e=${ref.e}`;
}
