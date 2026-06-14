/**
 * The Accounts data model — one strict interface matching the UNC partner
 * "Database load template" columns exactly, plus an ordered column map the
 * table renders from so headers and cells never drift out of sync.
 */

export interface AccountProfile {
  account: string;
  founded: string;
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

export type AccountColumn = {
  key: keyof AccountProfile;
  label: string;
  kind?: "account" | "link" | "wide";
};

/** Column order + display labels, matching the template's exact headers. */
export const ACCOUNT_COLUMNS: AccountColumn[] = [
  { key: "account", label: "Company", kind: "account" },
  { key: "founded", label: "Founded" },
  { key: "companyAliases", label: "Company Aliases" },
  { key: "parentAccount", label: "Parent Account" },
  { key: "topIndustrySectorProfile", label: "Top Industry Sector Profile" },
  { key: "secondaryIndustrySectorProfile", label: "Secondary Industry Sector Profile" },
  { key: "description", label: "Description", kind: "wide" },
  { key: "website", label: "Website", kind: "link" },
  { key: "companyStructure", label: "Company Structure" },
  { key: "ownership", label: "Ownership" },
  { key: "streetAddress", label: "Street Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zipCode", label: "Zip code" },
  { key: "country", label: "Country" },
  { key: "approximateEmployees", label: "Approximate Employees" },
  { key: "approximateRevenue", label: "Approximate Revenue" },
  { key: "keyProducts", label: "Key Products", kind: "wide" },
  { key: "businessSplit", label: "Business Split" },
  { key: "researchBy", label: "Research by" },
  { key: "dateOfResearch", label: "Date of Research" },
  { key: "resources", label: "Resources", kind: "wide" },
  { key: "linkToReport", label: "Link to report", kind: "link" },
];
