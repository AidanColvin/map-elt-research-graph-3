/**
 * Report export — one source of truth, three formats.
 *
 * The on-screen report (components/Report.tsx) and every downloadable file
 * must show the SAME content in the SAME order with the SAME citation numbers.
 * To guarantee that, we flatten the report into a small, format-neutral block
 * list (the IR below) exactly once, then render that IR to Markdown, PDF, or
 * Word. Add a section in one place; all three downloads stay in sync.
 */
import type { ReportData, CitationIndex } from '@/components/Report';
import { normalize, buildCitationIndex, parseMoney, fmtUsd } from '@/components/Report';
import { PdfDoc, wrapText, textWidth } from '@/lib/pdf-writer';
import type { SectorReportModel } from '@/lib/sectorReport';

// ── Block intermediate representation ──────────────────────────────────────
export type ChartSeries = { label: string; value: number; color?: string };
export type Block =
  | { t: 'h1'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'meta'; pairs: [string, string][] }
  | { t: 'list'; items: string[] }
  | { t: 'table'; headers: string[]; rows: string[][] }
  | { t: 'refs'; items: { id: number; text: string; url: string }[] }
  | { t: 'pagebreak' }
  | { t: 'statgrid'; cells: { n: string; l: string }[] }
  | { t: 'chart'; chartKind: 'bars' | 'donut'; title: string; subtitle?: string; series: ChartSeries[]; money?: boolean; solid?: boolean; barColor?: [number, number, number] };

// ── Helpers ────────────────────────────────────────────────────────────────

// Inline citation marker, e.g. " [1,2]" — plain text so it survives every format.
function mark(urls: string[] | undefined, cites: CitationIndex): string {
  if (!urls || !urls.length) return '';
  const nums = urls.map((u) => cites.numberOf(u)).filter((n) => n > 0);
  return nums.length ? ` [${nums.join(',')}]` : '';
}

function fmtGenerated(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function resolutionLabel(r?: string): string {
  switch (r) {
    case 'curated': return 'Curated sector set';
    case 'discovered': return 'Discovered live from SEC EDGAR';
    case 'override': return 'Custom company list';
    case 'default': return 'Generic anchor set';
    default: return r || '';
  }
}

/** Build a filesystem-safe base name like "oncology-partnership-report". */
export function reportFilename(rawData: any): string {
  const sector = (rawData?.report_meta?.sector || rawData?.sector || 'report')
    .toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  return `${sector}-partnership-report`;
}

// ── IR builder: ReportData -> Block[] ──────────────────────────────────────
export function buildBlocks(rawData: any): { blocks: Block[]; cites: CitationIndex } {
  const data: ReportData = normalize(rawData);
  const cites = buildCitationIndex(data);
  const b: Block[] = [];
  const m = data.report_meta;

  // Header + metadata
  b.push({ t: 'h1', text: m.sector });
  const meta: [string, string][] = [
    ['Prepared by', m.prepared_by],
    ['Date', m.date || 'n/a'],
  ];
  if (m.generated_at) meta.push(['Generated', fmtGenerated(m.generated_at)]);
  if (data._meta?.resolution) meta.push(['Company selection', resolutionLabel(data._meta.resolution)]);
  meta.push(['Version', m.version]);
  const v = data._validation;
  if (v) {
    meta.push(['Claims double-sourced', `${v.verified} / ${v.total_claims}`]);
    if (v.unverified > 0) meta.push(['Flagged for review', String(v.unverified)]);
  }
  b.push({ t: 'meta', pairs: meta });

  // ── Executive Overview (10-second scan) ──
  const profs = data.section4_profiles || [];
  const nCos = profs.length;
  const tied = profs.filter((p) => p.existing_unc_tie);
  const strategic = profs.filter((p) => p.partnership_type === 'Strategic').length;
  const translational = nCos - strategic;
  const ncBased = profs.filter((p) => (p as any).nc_based).length;
  const totalTrials = profs.reduce((s, p) => s + (p.pipeline?.length || 0), 0);
  const topTied = tied.slice(0, 3).map((p) => p.company_name);
  const revSeries = profs
    .map((p) => ({ label: p.company_name, value: parseMoney(p.facts?.['revenue']?.value) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const rdSeries = profs
    .map((p) => ({ label: p.company_name, value: parseMoney(p.facts?.['rd expense']?.value || (p.facts as any)?.['rd_expense']?.value) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const trialSeries = profs
    .map((p) => ({ label: p.company_name, value: p.pipeline?.length || 0 }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const alignSeries = profs
    .map((p) => ({ label: p.company_name, value: p.unc_alignment?.length || 0 }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);

  if (nCos > 0) {
    b.push({ t: 'h2', text: 'Summary' });
    b.push({ t: 'p', text: 'One-page brief. The full sourced report follows.' });
    b.push({ t: 'meta', pairs: [
      ['Companies reviewed', String(nCos)],
      ['Documented UNC tie', String(tied.length)],
      ['Strategic scale', String(strategic)],
      ['NC-based', String(ncBased)],
      ['Trial programs', String(totalTrials)],
    ] });
    const thesis = `We reviewed ${nCos} ${m.sector} ${nCos === 1 ? 'company' : 'companies'} as research partners for UNC Chapel Hill. `
      + `${tied.length} of ${nCos} have a documented UNC link: a shared trial, an NIH grant, or a co-authored paper. `
      + `${strategic} ${strategic === 1 ? 'is' : 'are'} large enough to anchor a strategic deal${ncBased > 0 ? ` (${ncBased} based in North Carolina)` : ''}.`
      + (topTied.length ? ` The best first targets are ${topTied.join(', ')}, where UNC scientists already study related work.` : '');
    b.push({ t: 'p', text: thesis });
    b.push({ t: 'chart', chartKind: 'donut', solid: true, title: 'Existing UNC connection', series: [
      { label: 'Existing tie', value: tied.length, color: '#0a0a0a' },
      { label: 'No documented tie', value: nCos - tied.length, color: '#d4d4d4' },
    ] });
    b.push({ t: 'chart', chartKind: 'donut', solid: true, title: 'Partnership scale', series: [
      { label: 'Strategic', value: strategic, color: '#0a0a0a' },
      { label: 'Translational', value: translational, color: '#9a988f' },
    ] });
    // What SEC filings show now
    const combinedRev = revSeries.reduce((s, d) => s + d.value, 0);
    const topRev = revSeries[0], topRd = rdSeries[0];
    if (topRev || topRd) {
      let secLine = 'What SEC filings show now. ';
      if (revSeries.length) secLine += `Across ${revSeries.length} public ${revSeries.length === 1 ? 'company' : 'companies'}, latest reported revenue totals ${fmtUsd(combinedRev)}. `;
      if (topRev) secLine += `${topRev.label} is largest at ${fmtUsd(topRev.value)}. `;
      if (topRd) secLine += `${topRd.label} leads R&D spend at ${fmtUsd(topRd.value)}.`;
      b.push({ t: 'p', text: secLine });
    }
    const nc = data.section1_overview.nc_context;
    if (nc?.text) b.push({ t: 'p', text: `NC context. ${nc.text}` + mark(nc.sources, cites) });
    const units = data.section1_overview.unc_units || [];
    if (units.length) b.push({ t: 'p', text: `UNC schools and centers active. ${units.map((u) => u.unit).join(', ')}.` });
    b.push({ t: 'pagebreak' });
  }

  // Section 1 - Sector Overview
  const s1 = data.section1_overview;
  b.push({ t: 'h2', text: '01  Sector Overview' });
  b.push({ t: 'h3', text: '1.1 Sector Definition and Scale' });
  if (s1.definition.text) b.push({ t: 'p', text: s1.definition.text + mark(s1.definition.sources, cites) });
  if (s1.scale.text) b.push({ t: 'p', text: s1.scale.text + mark(s1.scale.sources, cites) });
  if (revSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'Annual revenue by company', subtitle: 'Latest reported, SEC XBRL', series: revSeries, money: true });
  if (rdSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'R&D expense by company', subtitle: 'Latest reported, SEC XBRL', series: rdSeries, money: true });
  b.push({ t: 'h3', text: '1.2 Why This Sector Now' });
  b.push(s1.why_now.length
    ? { t: 'list', items: s1.why_now.map((s) => s.signal + mark(s.sources, cites)) }
    : { t: 'p', text: 'No signals identified.' });
  b.push({ t: 'h3', text: '1.3 NC-Specific Industry Context' });
  if (s1.nc_context.text) b.push({ t: 'p', text: s1.nc_context.text + mark(s1.nc_context.sources, cites) });
  b.push({ t: 'h3', text: '1.4 UNC Schools and Centers Active in This Sector' });
  b.push(s1.unc_units.length
    ? { t: 'table', headers: ['UNC Unit', 'Focus', 'Ref.'],
        rows: s1.unc_units.map((u) => [u.unit, u.focus, mark([u.url], cites).trim()]) }
    : { t: 'p', text: 'No UNC units identified.' });

  // Section 2 - Internal Mapping
  const s2 = data.section2_internal_mapping;
  b.push({ t: 'h2', text: '02  Internal Mapping' });
  b.push({ t: 'h3', text: '2.1 Known UNC Partnerships in This Sector' });
  b.push(s2.known_partnerships.length
    ? { t: 'table', headers: ['Company', 'UNC Unit', 'Type', 'Active?', 'Ref.'],
        rows: s2.known_partnerships.map((p) => [p.company, p.unc_unit, p.relationship_type, p.active, mark(p.sources, cites).trim()]) }
    : { t: 'p', text: 'None identified.' });
  if (alignSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'UNC alignment signals by company', subtitle: 'Matched grants, trials, and publications', series: alignSeries });
  b.push({ t: 'h3', text: '2.2 UNC Investigators on Company-Overlapping NIH Grants' });
  b.push(s2.unc_faculty.length
    ? { t: 'table', headers: ['Faculty', 'School', 'Research Focus', 'Ref.'],
        rows: s2.unc_faculty.map((f) => [f.name, f.school, f.research_focus, mark(f.sources, cites).trim()]) }
    : { t: 'p', text: 'None identified.' });
  b.push({ t: 'h3', text: '2.3 UNC Data Assets Relevant to This Sector' });
  b.push(s2.data_assets.length
    ? { t: 'table', headers: ['Dataset', 'Description', 'Held By', 'Ref.'],
        rows: s2.data_assets.map((d) => [d.name, d.description, d.held_by, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None identified.' });
  b.push({ t: 'h3', text: '2.4 Relationship Risk Flags' });
  b.push(s2.risk_flags.length
    ? { t: 'table', headers: ['Company', 'Risk', 'Ref.'],
        rows: s2.risk_flags.map((r) => [r.company, r.risk, mark(r.sources, cites).trim()]) }
    : { t: 'p', text: 'No risks flagged.' });

  // Section 3 — Company Selection
  const s3 = data.section3_selection;
  b.push({ t: 'h2', text: '03  Company Selection' });
  b.push({ t: 'h3', text: '3.2 Companies Selected' });
  b.push(s3.selected.length
    ? { t: 'table', headers: ['Company', 'UNC Alignment', 'Existing Tie', 'Ref.'],
        rows: s3.selected.map((s) => [s.company, s.unc_alignment, s.existing_tie, mark(s.sources, cites).trim()]) }
    : { t: 'p', text: 'No selections recorded.' });
  b.push({ t: 'h3', text: '3.3 Companies Reviewed and Excluded' });
  b.push(s3.excluded.length
    ? { t: 'table', headers: ['Company', 'Reason', 'Ref.'],
        rows: s3.excluded.map((s) => [s.company, s.reason, mark(s.sources, cites).trim()]) }
    : { t: 'p', text: 'No exclusions recorded.' });

  // Section 4 - Company Profiles
  b.push({ t: 'h2', text: '04  Company Profiles' });
  if (trialSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'Clinical-trial programs by company', subtitle: 'Documented on ClinicalTrials.gov', series: trialSeries });
  data.section4_profiles.forEach((p) => {
    const tie = p.existing_unc_tie ? 'Existing UNC tie' : 'No UNC tie';
    b.push({ t: 'h3', text: `${p.company_name} (${p.partnership_type}, ${tie})` });
    if (p.overview.text) b.push({ t: 'p', text: p.overview.text + mark(p.overview.sources, cites) });

    const facts = Object.entries(p.facts || {});
    if (facts.length) {
      b.push({ t: 'table', headers: ['Field', 'Value'],
        rows: facts.map(([k, val]) => [k.replace(/_/g, ' '), val?.value ?? '']) });
    }

    if (p.sec_filings) {
      const lines: string[] = [];
      Object.entries(p.sec_filings).forEach(([form, list]) => {
        if (Array.isArray(list) && list.length) {
          lines.push(`${form}: ${list.map((f) => f.date || 'undated').join(', ')}`);
        }
      });
      if (lines.length) {
        b.push({ t: 'h3', text: 'Recent SEC Filings' });
        b.push({ t: 'list', items: lines });
      }
    }

    if (p.pipeline.length) {
      b.push({ t: 'h3', text: 'Pipeline and Platform' });
      b.push({ t: 'table', headers: ['Program', 'Indication', 'Stage', 'Ref.'],
        rows: p.pipeline.map((r) => [r.program, r.indication, r.stage, mark(r.sources, cites).trim()]) });
    }
    if (p.partnering_history.length) {
      b.push({ t: 'h3', text: 'External Partnering History' });
      b.push({ t: 'table', headers: ['Partner', 'Deal Type', 'Year', 'Ref.'],
        rows: p.partnering_history.map((r) => [r.partner, r.deal_type, r.year, mark(r.sources, cites).trim()]) });
    }
    if (p.unc_alignment.length) {
      b.push({ t: 'h3', text: 'Pipeline Alignment with UNC' });
      p.unc_alignment.forEach((a) => {
        b.push({ t: 'p', text: `${a.company_program} → ${a.unc_unit}` });
        b.push({ t: 'p', text: `Company: ${a.company_fact}` });
        b.push({ t: 'p', text: `UNC: ${a.unc_fact}` });
        b.push({ t: 'p', text: `Why it matters: ${a.rationale}${mark(a.sources, cites)}` });
      });
    }
    if (p.what_unc_offers.length) {
      b.push({ t: 'h3', text: 'What UNC Can Offer' });
      b.push({ t: 'table', headers: ['Offering', 'Description', 'Ref.'],
        rows: p.what_unc_offers.map((r) => [r.offering, r.description, mark(r.sources, cites).trim()]) });
    }
    if (p.signals.length) {
      b.push({ t: 'h3', text: 'Key Recent Signals' });
      b.push({ t: 'list', items: p.signals.map((s) => s.signal + mark(s.sources, cites)) });
    }
  });

  // Section 5 — Value Proposition
  const s5 = data.section5_value_prop;
  b.push({ t: 'h2', text: '05  Value Proposition' });
  b.push({ t: 'h3', text: '5.1 UNC Data Assets' });
  b.push(s5.data_assets.length
    ? { t: 'table', headers: ['Dataset', 'Description', 'Relevance', 'Ref.'],
        rows: s5.data_assets.map((d) => [d.name, d.description, d.relevance, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.2 UNC Research Capacity' });
  b.push(s5.research_capacity.length
    ? { t: 'table', headers: ['Name', 'Role', 'Expertise', 'Ref.'],
        rows: s5.research_capacity.map((d) => [d.name, d.role, d.expertise, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.3 Talent Pipeline' });
  b.push(s5.talent_pipeline.length
    ? { t: 'table', headers: ['Program', 'School', 'Output', 'Ref.'],
        rows: s5.talent_pipeline.map((d) => [d.program, d.school, d.output, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.4 NC Access and Infrastructure' });
  b.push(s5.nc_access.length
    ? { t: 'table', headers: ['Asset', 'Description', 'Ref.'],
        rows: s5.nc_access.map((d) => [d.asset, d.description, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.6 Partnership Models Available' });
  b.push({ t: 'table', headers: ['Model', 'Description', 'UNC Unit'],
    rows: s5.partnership_models.map((d) => [d.model, d.description, d.unit]) });

  // Section 6 — Talking Points
  const s6 = data.section6_talking_points;
  b.push({ t: 'h2', text: '06  Talking Points' });
  b.push({ t: 'h3', text: 'Sector Opening' });
  if (s6.sector_opening.text) b.push({ t: 'p', text: s6.sector_opening.text + mark(s6.sector_opening.sources, cites) });
  s6.companies.forEach((c) => {
    b.push({ t: 'h3', text: c.company });
    b.push({ t: 'p', text: `1. Know the company: ${c.know_company.text}${mark(c.know_company.sources, cites)}` });
    b.push({ t: 'p', text: `2. Know their pipeline: ${c.know_pipeline.text}${mark(c.know_pipeline.sources, cites)}` });
    b.push({ t: 'p', text: `3. Know their moves: ${c.know_moves.text}${mark(c.know_moves.sources, cites)}` });
    b.push({ t: 'p', text: `4. UNC hook: ${c.unc_hook.text}${mark(c.unc_hook.sources, cites)}` });
  });

  // References (AMA)
  if (cites.list.length) {
    b.push({ t: 'h2', text: '07  References' });
    b.push({ t: 'p', text: 'Citations follow AMA Manual of Style (11th ed.).' });
    b.push({ t: 'refs', items: cites.list.map((r) => ({
      id: r.id, text: r.ama.replace(r.url, '').trim(), url: r.url,
    })) });
  }

  return { blocks: b, cites };
}

// ── Browser download helper ────────────────────────────────────────────────
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Color helper ─────────────────────────────────────────────────────────────
// Parse a "#rrggbb" hex string into a [r,g,b] tuple in 0..1 for the PDF writer.
function hexRgb(hex: string | undefined, fallback: [number, number, number] = [0.6, 0.6, 0.6]): [number, number, number] {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ── Native vector PDF renderer for the Block IR ──────────────────────────────
// Renders a Block[] to a paginated, vector PDF using PdfDoc. A top-down `y`
// cursor is tracked and a new page is started whenever content would overflow,
// so memory stays flat regardless of report length (no DOM rasterization).
function renderBlocksToPdf(doc: PdfDoc, blocks: Block[], titleOverride?: string, startY = 48): void {
  const margin = 48;
  const contentW = doc.width - margin * 2;
  // y measured from the TOP of the page; converted to PDF coords on write.
  let y = startY;

  // Convert top-down y to PDF bottom-up baseline coordinate.
  const baseline = (topY: number, size: number) => doc.height - topY - size;
  // Ensure `need` points of vertical space remain; else start a new page.
  const ensure = (need: number) => {
    if (y + need > doc.height - margin) { doc.addPage(); y = margin; }
  };
  // Emit wrapped text at the current cursor, advancing y. `gap` is trailing space.
  const writeText = (
    text: string, size: number, bold: boolean, gap: number,
    color: [number, number, number] = [0, 0, 0], indent = 0,
  ) => {
    const lines = wrapText(text, size, contentW - indent);
    const lineH = size + 4;
    for (const ln of lines) {
      ensure(lineH);
      doc.text(ln, margin + indent, baseline(y, size), { size, bold, color });
      y += lineH;
    }
    y += gap;
  };

  if (titleOverride) writeText(titleOverride, 20, true, 12);

  for (const b of blocks) {
    switch (b.t) {
      case 'h1': y += 4; writeText(b.text, 20, true, 10); break;
      case 'h2': y += 8; writeText(b.text, 15, true, 7); break;
      case 'h3': y += 5; writeText(b.text, 12.5, true, 5); break;
      case 'p': writeText(b.text, 10.5, false, 8); break;
      case 'meta':
        for (const [k, v] of b.pairs) writeText(`${k}: ${v}`, 10, false, 2, [0.25, 0.25, 0.25]);
        y += 6;
        break;
      case 'list':
        for (const it of b.items) writeText(`•  ${it}`, 10.5, false, 3, [0, 0, 0], 8);
        y += 6;
        break;
      case 'refs':
        for (const r of b.items) writeText(`${r.id}. ${r.text} ${r.url}`, 9, false, 3, [0.2, 0.2, 0.2], 8);
        y += 6;
        break;
      case 'pagebreak': doc.addPage(); y = margin; break;
      case 'statgrid': {
        // A row of bordered stat boxes, mirroring the on-screen stat strip
        // (big number over a small uppercase label).
        const cells = b.cells.length ? b.cells : [{ n: '0', l: '' }];
        const gap = 8;
        const boxW = (contentW - gap * (cells.length - 1)) / cells.length;
        const boxH = 50;
        ensure(boxH + 12);
        const top = y;
        for (let i = 0; i < cells.length; i++) {
          const x = margin + i * (boxW + gap);
          doc.rect(x, doc.height - top - boxH, boxW, boxH, [0.98, 0.98, 0.98]);
          doc.text(cells[i].n, x + 11, baseline(top + 10, 17), { size: 17, bold: true, color: [0.11, 0.11, 0.11] });
          let lbl = cells[i].l.toUpperCase();
          while (textWidth(lbl, 7) > boxW - 18 && lbl.length > 3) lbl = lbl.slice(0, -1);
          doc.text(lbl, x + 11, baseline(top + 34, 7), { size: 7, color: [0.54, 0.54, 0.57] });
        }
        y = top + boxH + 14;
        break;
      }
      case 'table': renderPdfTable(doc, b, margin, contentW, () => y, (v) => { y = v; }, ensure, baseline); break;
      case 'chart': renderPdfChart(doc, b, margin, contentW, () => y, (v) => { y = v; }, ensure, baseline); break;
    }
  }
}

// Render a table block with a filled header row, wrapped cell text, and row
// rules. Long tables paginate: the header is repeated on each continuation page.
function renderPdfTable(
  doc: PdfDoc, b: Extract<Block, { t: 'table' }>,
  margin: number, contentW: number,
  getY: () => number, setY: (v: number) => void,
  ensure: (n: number) => void,
  baseline: (topY: number, size: number) => number,
): void {
  const size = 8.5, pad = 4, lineH = size + 3;
  const cols = b.headers.length || 1;
  // Equal column widths is simple and robust for arbitrary content.
  const colW = contentW / cols;

  const drawRow = (cells: string[], header: boolean) => {
    const wrapped = cells.map((c) => wrapText(String(c ?? ''), size, colW - pad * 2));
    const rows = Math.max(1, ...wrapped.map((w) => w.length));
    const rowH = rows * lineH + pad * 2;
    let y = getY();
    if (y + rowH > doc.height - margin) { doc.addPage(); setY(margin); y = margin; }
    if (header) doc.rect(margin, doc.height - y - rowH, contentW, rowH, [0.08, 0.08, 0.08]);
    for (let c = 0; c < cols; c++) {
      const x = margin + c * colW + pad;
      const lines = wrapped[c] || [];
      for (let li = 0; li < lines.length; li++) {
        const ty = y + pad + li * lineH;
        doc.text(lines[li], x, baseline(ty, size), {
          size, bold: header, color: header ? [1, 1, 1] : [0.1, 0.1, 0.1],
        });
      }
    }
    const bottom = doc.height - (y + rowH);
    doc.line(margin, bottom, margin + contentW, bottom, 0.4, [0.85, 0.85, 0.85]);
    setY(y + rowH);
  };

  setY(getY() + 2);
  drawRow(b.headers, true);
  for (const r of b.rows) drawRow(r, false);
  setY(getY() + 10);
}

// Render a chart block as native vector graphics: horizontal bars for 'bars',
// and a pie/donut of filled sectors plus a legend for 'donut'.
function renderPdfChart(
  doc: PdfDoc, b: Extract<Block, { t: 'chart' }>,
  margin: number, contentW: number,
  getY: () => number, setY: (v: number) => void,
  ensure: (n: number) => void,
  baseline: (topY: number, size: number) => number,
): void {
  const fmtVal = (n: number) => (b.money ? fmtUsd(n) : String(n));

  // Title + subtitle.
  setY(getY() + 6);
  let y = getY();
  ensure(16);
  doc.text(b.title, margin, baseline(y, 11), { size: 11, bold: true });
  y += 15;
  if (b.subtitle) {
    ensure(12);
    doc.text(b.subtitle, margin, baseline(y, 8.5), { size: 8.5, color: [0.45, 0.45, 0.45] });
    y += 13;
  }
  setY(y);

  if (b.chartKind === 'donut') {
    const total = b.series.reduce((s, x) => s + x.value, 0) || 1;
    const r = 36;
    const needH = r * 2 + 12;
    if (getY() + needH > doc.height - margin) { doc.addPage(); setY(margin); }
    y = getY();
    const cx = margin + r;
    const cy = doc.height - (y + r);
    let a0 = Math.PI / 2; // start at top, go clockwise
    for (const s of b.series) {
      const ang = (s.value / total) * Math.PI * 2;
      doc.sector(cx, cy, r, a0 - ang, a0, hexRgb(s.color), b.solid ? 0 : r * 0.58);
      a0 -= ang;
    }
    // Legend to the right of the donut.
    let ly = y + 4;
    const lx = margin + r * 2 + 18;
    for (const s of b.series) {
      doc.rect(lx, doc.height - ly - 9, 9, 9, hexRgb(s.color));
      doc.text(`${s.label}: ${s.value}`, lx + 14, baseline(ly, 9), { size: 9, color: [0.12, 0.12, 0.12] });
      ly += 16;
    }
    setY(Math.max(y + needH, ly) + 8);
    return;
  }

  // Horizontal bars.
  const rows = b.series.filter((d) => d.value > 0);
  const max = Math.max(...rows.map((d) => d.value), 1);
  const rowH = 16, labelW = 120, barX = margin + labelW + 4;
  const barMax = contentW - labelW - 70;
  for (const d of rows) {
    if (getY() + rowH > doc.height - margin) { doc.addPage(); setY(margin); }
    y = getY();
    const midTop = y + rowH / 2 - 4.5;
    // Label (truncate to fit).
    let label = d.label;
    while (textWidth(label, 8.5) > labelW - 4 && label.length > 4) label = label.slice(0, -2);
    if (label !== d.label) label += '…';
    doc.text(label, margin, baseline(midTop, 8.5), { size: 8.5, color: [0.2, 0.2, 0.2] });
    // Track + bar.
    const trackY = doc.height - (y + rowH / 2 + 4);
    doc.rect(barX, trackY, barMax, 8, [0.93, 0.93, 0.93]);
    const w = Math.max(2, (d.value / max) * barMax);
    doc.rect(barX, trackY, w, 8, b.barColor ?? [0.04, 0.04, 0.04]);
    // Value.
    doc.text(fmtVal(d.value), barX + barMax + 6, baseline(midTop, 8.5), { size: 8.5, bold: true });
    setY(y + rowH);
  }
  setY(getY() + 10);
}

// ── Renderer 1: Markdown ────────────────────────────────────────────────────
export function blocksToMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const blk of blocks) {
    switch (blk.t) {
      case 'h1': out.push(`# ${blk.text}\n`); break;
      case 'h2': out.push(`\n## ${blk.text}\n`); break;
      case 'h3': out.push(`\n### ${blk.text}\n`); break;
      case 'p': out.push(`${blk.text}\n`); break;
      case 'meta':
        out.push(blk.pairs.map(([k, val]) => `**${k}:** ${val}`).join('  \n') + '\n');
        break;
      case 'list':
        out.push(blk.items.map((i) => `- ${i}`).join('\n') + '\n');
        break;
      case 'table': {
        out.push(`| ${blk.headers.join(' | ')} |`);
        out.push(`| ${blk.headers.map(() => '---').join(' | ')} |`);
        for (const r of blk.rows) {
          out.push(`| ${r.map((c) => (c || '').replace(/\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`);
        }
        out.push('');
        break;
      }
      case 'refs':
        out.push(blk.items.map((r) => `${r.id}. ${r.text} ${r.url}`).join('\n') + '\n');
        break;
      case 'pagebreak':
        out.push('\n---\n');
        break;
      case 'chart': {
        out.push(`\n**${blk.title}**${blk.subtitle ? ` (${blk.subtitle})` : ''}\n`);
        out.push(`| ${blk.chartKind === 'donut' ? 'Segment' : 'Company'} | Value |`);
        out.push(`| --- | --- |`);
        for (const s of blk.series) {
          out.push(`| ${s.label} | ${blk.money ? fmtUsd(s.value) : s.value} |`);
        }
        out.push('');
        break;
      }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function downloadMarkdown(rawData: any) {
  const { blocks } = buildBlocks(rawData);
  const md = blocksToMarkdown(blocks);
  saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${reportFilename(rawData)}.md`);
}

// ── Renderer 2: Word (.docx) ────────────────────────────────────────────────
// takes: a Block[] IR and the loaded `docx` module exports
// does: appends native docx children (headings, paragraphs, tables, lists,
//       meta pairs, references, and charts-as-data-tables) for each block
// returns: nothing (mutates `children`)
function blocksToDocxChildren(blocks: Block[], dx: any, children: any[]): void {
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, PageBreak } = dx;
  const makeTable = (headers: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headers, ...rows].map((row, ri) =>
        new TableRow({
          children: row.map((cell) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ''), bold: ri === 0 })] })] })),
        })),
    });

  for (const b of blocks) {
    switch (b.t) {
      case 'h1': children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: b.text })); break;
      case 'h2': children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: b.text })); break;
      case 'h3': children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, text: b.text })); break;
      case 'p': children.push(new Paragraph({ children: [new TextRun(b.text)] })); break;
      case 'meta':
        for (const [k, v] of b.pairs)
          children.push(new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(v)] }));
        children.push(new Paragraph({ text: '' }));
        break;
      case 'list':
        for (const it of b.items) children.push(new Paragraph({ text: it, bullet: { level: 0 } }));
        break;
      case 'refs':
        for (const r of b.items) children.push(new Paragraph({ text: `${r.id}. ${r.text} ${r.url}` }));
        break;
      case 'table':
        children.push(makeTable(b.headers, b.rows));
        children.push(new Paragraph({ text: '' }));
        break;
      case 'chart':
        // Charts render as a titled data table in Word.
        children.push(new Paragraph({ children: [new TextRun({ text: b.title + (b.subtitle ? ` (${b.subtitle})` : ''), bold: true })] }));
        children.push(makeTable(
          [b.chartKind === 'donut' ? 'Segment' : 'Company', 'Value'],
          b.series.map((s) => [s.label, b.money ? fmtUsd(s.value) : String(s.value)]),
        ));
        children.push(new Paragraph({ text: '' }));
        break;
      case 'pagebreak': children.push(new Paragraph({ children: [new PageBreak()] })); break;
    }
  }
}

// takes: the structured sector ReportData (raw)
// does: builds the Block IR and renders it natively to a Word (.docx) document —
//       headings, paragraphs, tables, lists, and charts as data tables — with no
//       DOM capture, then triggers a browser download
// returns: nothing (saves "<sector>-partnership-report.docx")
export async function downloadDocx(rawData: any) {
  const { blocks } = buildBlocks(rawData);
  const dx = await import('docx');
  const children: any[] = [];
  blocksToDocxChildren(blocks, dx, children);

  const doc = new dx.Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children,
    }],
  });
  const blob = await dx.Packer.toBlob(doc);
  saveBlob(blob, `${reportFilename(rawData)}.docx`);
}

// ════════════════════════════════════════════════════════════════════════════
// Generic Markdown exports — used by the Company Deep Dive, whose report is a
// plain Markdown string (not the structured sector ReportData). These accept
// any Markdown + a title and render directly to PDF / Word / .md, so the same
// download row can serve any Markdown-based report without DOM capture.
// ════════════════════════════════════════════════════════════════════════════

// takes: a human title (e.g. a company name)
// does: turns it into a filesystem-safe base filename
// returns: a slug like "apple-deep-dive"
export function markdownExportName(title: string): string {
  const slug = (title || 'report')
    .toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  return `${slug}-deep-dive`;
}

// takes: a single line of inline Markdown
// does: strips inline markers (**bold**, *em*, `code`, ![img](url), [text](url))
//       down to readable plain text used by the PDF/Word renderers.
//       Images are removed entirely (no alt text noise in table cells).
//       Links keep only the visible text (URLs are stripped — they appear in the
//       references section verbatim and would overflow table columns).
// returns: the cleaned plain-text string
function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')         // images → remove entirely
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // links → text only
    .replace(/\*\*([^*]+)\*\*/g, '$1')              // bold
    .replace(/\*([^*]+)\*/g, '$1')                  // italics
    .replace(/`([^`]+)`/g, '$1')                    // inline code
    .replace(/\s{2,}/g, ' ')                        // collapse double-spaces left by removed images
    .trim();
}

// takes: a parsed chart spec object from a ```chart``` code block
// does: converts the LLM chart spec into the format-neutral Block chart IR.
//       line/bar → horizontal bars (the PDF renderer's native chart type).
//       donut/pie → donut sectors.
//       hierarchy → a Name/Role table (no vector tree renderer in PDF).
// returns: a Block or null if the spec is unrecognised
function chartSpecToBlock(spec: any): Block | null {
  const title: string = spec.title || 'Chart';
  const type: string = (spec.type || '').toLowerCase();

  if ((type === 'donut' || type === 'pie') && Array.isArray(spec.slices)) {
    return {
      t: 'chart', chartKind: 'donut', title, solid: type === 'pie',
      series: spec.slices.map((s: any) => ({
        label: String(s.label ?? ''), value: Number(s.value) || 0, color: s.color,
      })),
    };
  }

  if ((type === 'line' || type === 'bar') && Array.isArray(spec.series)) {
    const xs: string[] = Array.isArray(spec.x) ? spec.x : [];
    const first = spec.series[0];
    if (first && Array.isArray(first.values)) {
      return {
        t: 'chart', chartKind: 'bars', title,
        subtitle: type === 'line' ? 'Trend over time' : undefined,
        series: xs.map((label: string, i: number) => ({
          label, value: Number(first.values[i]) || 0, color: first.color,
        })),
      };
    }
  }

  if (type === 'hierarchy') {
    const rows: string[][] = [];
    if (spec.root) rows.push([String(spec.root.label ?? ''), String(spec.root.sub ?? '')]);
    if (Array.isArray(spec.children)) {
      spec.children.forEach((c: any) => rows.push([String(c.label ?? ''), String(c.sub ?? '')]));
    }
    return rows.length ? { t: 'table', headers: ['Name', 'Role'], rows } : null;
  }

  return null;
}

// takes: a Markdown document string
// does: parses it into the format-neutral Block[] IR (headings, paragraphs,
//       bullet lists, and GitHub-style pipe tables) so a single block list can
//       be rendered to any output format
// returns: the parsed Block[] list
export function parseMarkdownBlocks(md: string): Block[] {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) { blocks.push({ t: 'p', text: stripInline(para.join(' ')) }); para = []; }
  };
  const flushList = () => {
    if (list.length) { blocks.push({ t: 'list', items: list.map(stripInline) }); list = []; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // Fenced code block: ```lang ... ```.
    // The only language we render is "chart"; everything else is skipped silently.
    if (trimmed.startsWith('```')) {
      flushPara(); flushList();
      const lang = trimmed.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      // i now points at the closing fence; the outer loop's i++ advances past it.
      if (lang === 'chart') {
        const code = codeLines.join('\n').trim();
        if (code) {
          try {
            const cb = chartSpecToBlock(JSON.parse(code));
            if (cb) blocks.push(cb);
          } catch { /* skip malformed chart JSON */ }
        }
      }
      continue;
    }

    // Pipe table: a header row followed by a |---|---| separator row.
    if (trimmed.startsWith('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) {
      flushPara(); flushList();
      const toCells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => stripInline(c));
      const headers = toCells(line);
      const rows: string[][] = [];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(toCells(lines[i])); i++;
      }
      i--; // step back; loop will advance
      blocks.push({ t: 'table', headers, rows });
      continue;
    }

    if (!trimmed) { flushPara(); flushList(); continue; }
    if (/^#{1}\s+/.test(trimmed)) { flushPara(); flushList(); blocks.push({ t: 'h1', text: stripInline(trimmed.replace(/^#\s+/, '')) }); continue; }
    if (/^#{2}\s+/.test(trimmed)) { flushPara(); flushList(); blocks.push({ t: 'h2', text: stripInline(trimmed.replace(/^#{2}\s+/, '')) }); continue; }
    if (/^#{3,}\s+/.test(trimmed)) { flushPara(); flushList(); blocks.push({ t: 'h3', text: stripInline(trimmed.replace(/^#{3,}\s+/, '')) }); continue; }
    if (/^[-*]{3,}$/.test(trimmed)) { flushPara(); flushList(); blocks.push({ t: 'pagebreak' }); continue; }
    if (/^[-*+]\s+/.test(trimmed)) { flushPara(); list.push(trimmed.replace(/^[-*+]\s+/, '')); continue; }

    flushList();
    para.push(trimmed);
  }
  flushPara(); flushList();
  return blocks;
}

// takes: a Markdown string and a display title
// does: renders the Markdown to a paginated, text-based PDF (headings, body
//       text, bullet lists, tables) and triggers a browser download
// returns: nothing (saves "<title>-deep-dive.pdf")
export async function downloadMarkdownPdf(markdown: string, title: string) {
  const blocks = parseMarkdownBlocks(markdown);
  const doc = new PdfDoc();
  renderBlocksToPdf(doc, blocks, title);
  saveBlob(doc.save(), `${markdownExportName(title)}.pdf`);
}

// Page-matching bar colors (same hues as the on-screen SectorReportHeader:
// revenue ≈ #93b8f5 blue, R&D ≈ #9ed8bf green).
const REV_BAR: [number, number, number] = [0.576, 0.722, 0.961];
const RD_BAR: [number, number, number] = [0.62, 0.847, 0.749];

// takes: the SectorReportModel that drives the on-screen Partnership Report
// does: builds the same sections the page shows — title, stat strip, contact
//       tiers, OSP note, revenue/R&D bar charts (colored), priority matrix,
//       alignment chart, faculty, and data assets — as PDF blocks
// returns: a Block[] ready for renderBlocksToPdf
export function sectorModelToBlocks(m: SectorReportModel): Block[] {
  const b: Block[] = [];
  b.push({ t: 'p', text: `UNC PARTNERSHIP INTELLIGENCE · ${m.sector} · ${m.date} · ALL CLAIMS DOUBLE-SOURCED` });
  b.push({ t: 'h1', text: m.sector });
  b.push({ t: 'p', text: `${m.companiesReviewed} companies reviewed · SEC EDGAR · NIH RePORTER · PubMed · ClinicalTrials.gov` });

  const revStr = m.combinedRevenueB >= 1000
    ? `$${(m.combinedRevenueB / 1000).toFixed(1)}T`
    : `$${m.combinedRevenueB}B`;
  b.push({ t: 'statgrid', cells: [
    { n: String(m.uncTies), l: 'UNC ties' },
    { n: String(m.nihOverlaps), l: 'NIH grant overlaps' },
    { n: String(m.pubmedPapers), l: 'Co-authored papers' },
    { n: revStr, l: 'Combined revenue' },
    { n: String(m.ncHeadquartered), l: 'NC-headquartered' },
  ] });

  // Engagement routing — OSP first, then company readiness (no named contacts).
  if (m.ospCompanies.length) {
    b.push({ t: 'p', text: `Route initial outreach through UNC OSP (research.unc.edu/osp): ${m.ospCompanies.length} compan${m.ospCompanies.length === 1 ? 'y has' : 'ies have'} active NIH grants — verify before contacting any investigator.` });
  }
  b.push({ t: 'h3', text: 'Company readiness — UNC tie on record' });
  b.push(m.warm.length
    ? { t: 'list', items: m.warm.map((c) => `${c.name} · ${c.detail}${c.nc ? ' · NC' : ''}`) }
    : { t: 'p', text: 'None.' });
  if (m.cold.length) {
    b.push({ t: 'h3', text: 'No documented tie' });
    b.push({ t: 'p', text: m.cold.join(' · ') });
  }

  // Sector snapshot — colored revenue + R&D bars (valueB is in $B; scale to
  // raw dollars so the money formatter renders "$716.9B" like the page).
  b.push({ t: 'h2', text: 'Sector snapshot' });
  if (m.revenuePeers.length) b.push({
    t: 'chart', chartKind: 'bars', title: 'Revenue (SEC XBRL · latest FY)',
    series: m.revenuePeers.map((p) => ({ label: p.name, value: p.valueB * 1e9 })),
    money: true, barColor: REV_BAR,
  });
  if (m.rdPeers.length) b.push({
    t: 'chart', chartKind: 'bars', title: 'R&D spend',
    series: m.rdPeers.map((p) => ({ label: p.name, value: p.valueB * 1e9 })),
    money: true, barColor: RD_BAR,
  });

  // Priority matrix.
  b.push({ t: 'h2', text: 'Priority matrix' });
  b.push(m.matrix.length
    ? { t: 'table', headers: ['Company', 'Tier', 'Signal', 'Grant / paper', 'First move'],
        rows: m.matrix.map((r) => [
          r.company,
          r.signal === 'None' ? 'Various' : r.tier,
          r.signal,
          r.grantOrPmid || '—',
          r.firstMove,
        ]) }
    : { t: 'p', text: 'No prioritized companies.' });

  if (m.alignmentChart.length) b.push({
    t: 'chart', chartKind: 'bars', title: 'UNC alignment signals by company',
    subtitle: 'Matched grants, trials, and publications',
    series: m.alignmentChart.map((a) => ({ label: a.name, value: a.count })),
  });

  if (m.faculty.length) {
    b.push({ t: 'h2', text: 'UNC investigators with sector-overlapping NIH grants (NIH RePORTER · last 5 FY)' });
    b.push({ t: 'table', headers: ['PI', 'Unit', 'Grant', 'Topic', 'FY', 'Company overlap'],
      rows: m.faculty.map((f) => [f.name, f.unit, f.grant || '—', f.topic || '—', f.fy || '—', f.overlap || '—']) });
  }

  if (m.dataAssets.length) {
    b.push({ t: 'h2', text: 'UNC data assets available to partners' });
    b.push({ t: 'list', items: m.dataAssets.map((a) => `${a.name} — ${a.description} · held by ${a.heldBy}`) });
  }

  return b;
}

// takes: the SectorReportModel, per-company report markdown, and a title
// does: renders a rich PDF that mirrors the on-screen Partnership Report —
//       colored stat strip, charts, priority matrix, then one section per
//       company — so the download reflects the page instead of flat text
// returns: nothing (saves "<title>.pdf")
export async function downloadPartnershipPdf(
  m: SectorReportModel, cardMarkdowns: string[], title: string,
) {
  const blocks: Block[] = sectorModelToBlocks(m);
  for (const md of cardMarkdowns) {
    if (!md) continue;
    blocks.push({ t: 'pagebreak' });
    blocks.push(...parseMarkdownBlocks(md));
  }
  const doc = new PdfDoc();
  renderBlocksToPdf(doc, blocks, title);
  saveBlob(doc.save(), `${markdownExportName(title)}.pdf`);
}

// takes: a Markdown string, a display title, and optional filename override
// does: renders the Markdown to a branded PDF with the Map node-graph logo
//       drawn in the top-left of the first page header, then triggers download
// returns: nothing (saves "<filename>.pdf")
export async function downloadBrandedPdf(markdown: string, title: string, filename = 'report') {
  const blocks = parseMarkdownBlocks(markdown);
  const doc = new PdfDoc();
  drawMapBrandHeader(doc, title);
  // Start content below the branded header (extra top margin for header area)
  renderBlocksToPdf(doc, blocks, undefined, 88);
  saveBlob(doc.save(), `${filename}.pdf`);
}

// Draw the Map node-graph logo + report title in the top stripe of the first page.
// The logo is a central node with 6 spokes radiating at 60-degree intervals,
// matching the SVG in app/page.tsx. Uses doc.sector() for filled circles and
// doc.line() for spokes, all in native PDF coordinates.
function drawMapBrandHeader(doc: PdfDoc, title: string): void {
  const pageH = doc.height; // 792 pt
  const margin = 48;

  // Thin accent bar across top of page
  doc.rect(0, pageH - 32, doc.width, 32, [0.07, 0.07, 0.08]);

  // ── Map node-graph logo (centered vertically in the 32pt bar) ──
  const lx = margin;          // center-x of logo in PDF coords
  const ly = pageH - 16;      // center-y of logo (16pt from top = center of 32pt bar)
  const scale = 9;            // logo radius scale (viewBox 24→ pt)
  const r0 = 3.2 * scale / 12;  // central circle radius
  const r1 = 1.9 * scale / 12;  // outer dot radius
  const spoke = 8.5 * scale / 12; // spoke length

  const logoColor: [number, number, number] = [1, 1, 1];

  // Central circle (full sector 0→2π)
  doc.sector(lx, ly, r0, 0, Math.PI * 2, logoColor);

  // 6 spokes + outer dots
  [0, 60, 120, 180, 240, 300].forEach((deg) => {
    const rad = (deg * Math.PI) / 180;
    const ox = lx + spoke * Math.cos(rad);
    const oy = ly + spoke * Math.sin(rad);
    doc.line(lx, ly, ox, oy, 0.9, logoColor);
    doc.sector(ox, oy, r1, 0, Math.PI * 2, logoColor);
  });

  // ── Wordmark ──
  doc.text('Map', lx + spoke + r1 + 6, ly - 6, { size: 10, bold: true, color: [1, 1, 1] });
  doc.text('Research Intelligence', lx + spoke + r1 + 30, ly - 6, { size: 8, bold: false, color: [0.75, 0.75, 0.75] });

  // ── Report title below the bar ──
  doc.text(title, margin, pageH - 52, { size: 14, bold: true, color: [0.07, 0.07, 0.08] });
  doc.line(margin, pageH - 60, doc.width - margin, pageH - 60, 0.5, [0.85, 0.85, 0.85]);
}

// takes: a Markdown string and a display title
// does: renders the Markdown to a Word (.docx) document (headings, body text,
//       bullet lists, tables) and triggers a browser download
// returns: nothing (saves "<title>-deep-dive.docx")
export async function downloadMarkdownDocx(markdown: string, title: string) {
  const blocks = parseMarkdownBlocks(markdown);
  const dx = await import('docx');
  const children: any[] = [
    new dx.Paragraph({ heading: dx.HeadingLevel.TITLE, children: [new dx.TextRun({ text: title, bold: true })] }),
  ];
  blocksToDocxChildren(blocks, dx, children);

  const docFile = new dx.Document({
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
  });
  const blob = await dx.Packer.toBlob(docFile);
  saveBlob(blob, `${markdownExportName(title)}.docx`);
}

// takes: a Markdown string and a display title
// does: downloads the raw Markdown as a .md file
// returns: nothing (saves "<title>-deep-dive.md")
export function downloadMarkdownText(markdown: string, title: string) {
  saveBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${markdownExportName(title)}.md`);
}

// ── Renderer 3: PDF ─────────────────────────────────────────────────────────
// takes: the structured sector ReportData (raw)
// does: builds the Block IR and renders it to a paginated, vector PDF natively
//       (headings, paragraphs, tables, lists, and native vector charts) with no
//       DOM rasterization, keeping memory flat for long reports
// returns: nothing (saves "<sector>-partnership-report.pdf")
export async function downloadPdf(rawData: any) {
  const { blocks } = buildBlocks(rawData);
  const doc = new PdfDoc();
  renderBlocksToPdf(doc, blocks);
  saveBlob(doc.save(), `${reportFilename(rawData)}.pdf`);
}

// takes: a Markdown string and a display title
// does: renders the Markdown to PDF bytes via the same PdfDoc pipeline as
//       downloadMarkdownPdf, but WITHOUT triggering a browser download — for
//       bundling many PDFs into a ZIP (see lib/sector-package.ts)
// returns: the PDF file bytes
export function markdownToPdfBytes(markdown: string, title: string): Uint8Array {
  const blocks = parseMarkdownBlocks(markdown);
  const doc = new PdfDoc();
  renderBlocksToPdf(doc, blocks, title);
  return doc.saveBytes();
}

// takes: the structured sector ReportData (raw)
// does: renders the sector report to PDF bytes via the same pipeline as
//       downloadPdf, but WITHOUT triggering a browser download — for ZIP bundling
// returns: the PDF file bytes
export function sectorReportToPdfBytes(rawData: any): Uint8Array {
  const { blocks } = buildBlocks(rawData);
  const doc = new PdfDoc();
  renderBlocksToPdf(doc, blocks);
  return doc.saveBytes();
}
