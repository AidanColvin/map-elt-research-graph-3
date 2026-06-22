import { describe, it, expect } from "vitest";
import { isHealthSector } from "@/lib/domain";
import { buildSectorReport } from "@/lib/sectorReport";

// Regression guard from the 100-sector QA audit: every sector must classify into
// the right domain and route to relevant UNC data assets — and a non-health
// sector must NEVER surface a clinical/health dataset. See sectorReport.ts.

// User's intended health domain (from the 100-sector QA plan).
const HEALTH = new Set([
  "Healthcare and Social Assistance","Biotechnology","Medical Device Manufacturing","Pharmaceuticals",
  "Telehealth and Telemedicine","Genomics and Gene Editing","Health Information Technology","Biopharmaceutics",
  "Regenerative Medicine","Clinical Research Organizations","Personalized Medicine","Molecular Diagnostics",
  "Proteomics","Bioinformatics","Robotic Surgery","Patient Monitoring Systems","Remote Diagnostics",
  "Mental Health Digital Platforms","Electronic Health Records Optimization","Drug Discovery Informatics",
  "Digital Therapeutics","Wearable Health Tech","Neural Interfaces","Bio-printing","Bio-sensing Technology",
  "Synthetic Biology",
  // Computational Chemistry is treated as NON-health (routes to UNC Chemistry /
  // materials assets, which fit better than clinical data).
]);

const SECTORS = [
  "Real Estate and Rental and Leasing","Professional Scientific and Technical Services","Manufacturing",
  "Healthcare and Social Assistance","State and Local Government","Wholesale Trade","Retail Trade","Information",
  "Arts Entertainment and Recreation","Accommodation and Food Services","Construction","Federal Government",
  "Transportation and Warehousing","Administrative and Support Services","Utilities","Mining",
  "Agriculture Forestry Fishing and Hunting","Finance and Insurance","Management of Companies and Enterprises",
  "Educational Services","Waste Management and Remediation Services","Telecommunications","Broadcasting",
  "Commercial Banking","Life Insurance and Annuities","Cloud Computing","Cybersecurity","Semiconductor Manufacturing",
  "E-commerce Platforms","Fintech","Software as a Service","Internet of Things","Quantum Computing","Edtech",
  "Proptech","Insurtech","Autonomous Vehicles","Aerospace and Defense Tech","Biotechnology",
  "Medical Device Manufacturing","Pharmaceuticals","Telehealth and Telemedicine","Genomics and Gene Editing",
  "Health Information Technology","Biopharmaceutics","Regenerative Medicine","Clinical Research Organizations",
  "Personalized Medicine","Generative AI","Computer Vision","Natural Language Processing",
  "Robotic Process Automation","AI Infrastructure and Hardware","Autonomous Robotics","Predictive Analytics",
  "Edge Computing","Synthetic Biology","Neuromorphic Computing","Space Tech","Nanotechnology",
  "Battery Energy Storage","Sustainable Energy Systems","Augmented Reality","Virtual Reality","Wearable Health Tech",
  "Precision Agriculture","Blockchain Infrastructure","Digital Therapeutics","Bio-printing","Smart Grid Technology",
  "Data Center Operations","High-Performance Computing","Cryptography","Supply Chain Automation",
  "5G Network Infrastructure","Molecular Diagnostics","Proteomics","Bioinformatics","Neural Interfaces",
  "Advanced Materials Science","Human-Computer Interaction","Robotic Surgery","Patient Monitoring Systems",
  "Remote Diagnostics","Mental Health Digital Platforms","Electronic Health Records Optimization",
  "Drug Discovery Informatics","Computational Chemistry","Photonic Computing","3D Printing Manufacturing",
  "Waste-to-Energy Conversion","Carbon Capture Technology","Geo-spatial Analysis","Sentiment Analysis",
  "Gesture Recognition","Bio-sensing Technology","Neural Network Training","Quantum Cryptography","Cognitive Computing",
];

const HEALTH_ASSET = /lineberger|eshelman|cancer|health|tracs|ahec|sheps|biospecimen|sequencing|warehouse|biomedical|clinical|patient|tumor|medic/i;

describe("SECTOR AUDIT", () => {
  it("classification + data-asset routing for all sectors", () => {
    const healthGateBugs: string[] = [];
    const dataAssetBugs: string[] = [];
    const rows: string[] = [];
    for (const s of SECTORS) {
      const isH = isHealthSector(s);
      const expectH = HEALTH.has(s);
      const m = buildSectorReport({ report_meta: { sector: s }, section4_profiles: [] });
      const assetNames = m.dataAssets.map((a) => a.name);
      const hasHealthAsset = m.dataAssets.some((a) => HEALTH_ASSET.test(`${a.name} ${a.description}`));
      if (isH !== expectH) healthGateBugs.push(`  GATE: "${s}" isHealth=${isH} expected=${expectH}`);
      if (!expectH && hasHealthAsset) dataAssetBugs.push(`  ASSET(non-health shows health asset): "${s}" -> ${assetNames.join(" | ")}`);
      if (expectH && !hasHealthAsset) dataAssetBugs.push(`  ASSET(health lacks health asset): "${s}" -> ${assetNames.join(" | ")}`);
      rows.push(`${isH ? "H" : "·"} ${s}  ::  ${assetNames.map((n) => n.split(" ")[0]).join(", ")}`);
    }
    if (healthGateBugs.length) console.log("HEALTH-GATE BUGS:\n" + healthGateBugs.join("\n"));
    if (dataAssetBugs.length) console.log("DATA-ASSET BUGS:\n" + dataAssetBugs.join("\n"));
    void rows;
    expect(healthGateBugs, "every sector classifies to the correct health domain").toEqual([]);
    expect(dataAssetBugs, "non-health never shows health assets; health always does").toEqual([]);
  });

  it("never routes a non-health sector to a clinical data asset", () => {
    for (const s of ["Fintech", "Streaming", "Quantum Computing", "Defense", "Neuromorphic Computing", "Manufacturing", "Federal Government", "Edtech"]) {
      const m = buildSectorReport({ report_meta: { sector: s }, section4_profiles: [] });
      const joined = m.dataAssets.map((a) => `${a.name} ${a.description}`).join(" | ");
      expect(/lineberger|cancer|clinical|biospecimen|tracs|ahec|sheps/i.test(joined), `${s} -> ${joined}`).toBe(false);
    }
  });
});
