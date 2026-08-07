/**
 * Client-safe types for the workbook inventory. The DATA lives in the
 * server-only modules beside this file and is reachable only through
 * /api/inventory/data — never import those modules from client code.
 */

/** One row of the UNC Partnership Inventory sheet. */
export type PartnershipRecord = {
  unit: string;
  company: string;
  area: string;
  type: string;
  description: string;
  status: string;
  start: string;
  end: string;
  recurring: string;
  funding: string;
  fundingType: string;
  researched: string;
  researchBy: string;
  source: string;
};
