/**
 * Hardening for the backend proxy routes (/api/run-pipeline,
 * /api/run-pipeline-stream, /api/partnerships).
 *
 * These proxies are UNAUTHENTICATED and forward user JSON to an expensive
 * backend (SEC/PubMed/etc. fan-out). The destination URL is a fixed constant,
 * so there is no destination-SSRF — but a caller can still abuse them with huge
 * or malformed bodies, or oversized fan-out lists. This module caps body size
 * and validates the request shape BEFORE any upstream work happens, turning
 * unhandled 500s into clean 4xx and bounding the cost of a single request.
 */

// Pipeline/partnership payloads are tiny (a sector name + ≤25 short company
// strings). 16 KB is generous headroom and rejects anything pathological.
export const MAX_BODY_BYTES = 16 * 1024;

export type GuardResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

// takes: an incoming request
// does: enforces the body-size cap, then parses JSON
// returns: the parsed body, or a 413/400 GuardResult on oversize/malformed input
export async function readJsonBody(req: Request): Promise<GuardResult<unknown>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request body too large" };
  }
  const raw = await req.text();
  // Byte length, not char length — multibyte chars must count fully.
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request body too large" };
  }
  try {
    return { ok: true, value: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

// takes: any value and a max length
// does: checks it is a non-empty string within the length budget
// returns: the trimmed string, or null when it fails
function boundedStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= 1 && s.length <= max ? s : null;
}

export interface PipelineBody {
  sector: string;
  companies?: string[];
  company_override?: string;
}

// takes: a parsed request body
// does: validates the /run-pipeline shape (sector required; ≤25 short companies)
// returns: the normalized body, or a 400 GuardResult describing the problem
export function validatePipeline(body: unknown): GuardResult<PipelineBody> {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const sector = boundedStr(b.sector, 200);
  if (!sector) {
    return { ok: false, status: 400, error: "`sector` must be a non-empty string (≤200 chars)" };
  }
  let companies: string[] | undefined;
  if (b.companies != null) {
    if (!Array.isArray(b.companies) || b.companies.length > 25) {
      return { ok: false, status: 400, error: "`companies` must be an array of ≤25 items" };
    }
    companies = [];
    for (const c of b.companies) {
      const s = boundedStr(c, 120);
      if (!s) return { ok: false, status: 400, error: "each company must be a string ≤120 chars" };
      companies.push(s);
    }
  }
  const company_override =
    b.company_override != null ? boundedStr(b.company_override, 120) ?? undefined : undefined;
  return { ok: true, value: { sector, companies, company_override } };
}

export interface PartnershipBody {
  query: string;
  type: "company" | "sector";
}

// takes: a parsed request body
// does: validates the /partnerships shape (query required; type allowlisted)
// returns: the normalized body, or a 400 GuardResult describing the problem
export function validatePartnership(body: unknown): GuardResult<PartnershipBody> {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const query = boundedStr(b.query, 200);
  if (!query) {
    return { ok: false, status: 400, error: "`query` must be a non-empty string (≤200 chars)" };
  }
  const type = b.type === "sector" ? "sector" : "company";
  return { ok: true, value: { query, type } };
}
