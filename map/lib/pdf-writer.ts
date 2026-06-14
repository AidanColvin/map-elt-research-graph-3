/**
 * pdf-writer.ts — a tiny, dependency-free vector PDF writer.
 *
 * Why this exists: the report export used to rasterize the entire report DOM
 * with html2canvas into enormous PNG canvases (a 20-company report is ~70,000px
 * tall), which blew up memory and hit browser canvas-size limits. This module
 * builds a real, vector PDF directly as bytes — text, lines, and filled
 * rectangles — so memory stays flat regardless of report length.
 *
 * Scope / simplifications (deliberate, to stay dependency-free):
 *  - Letter page only (612 x 792 pt).
 *  - Standard "base-14" Type1 fonts (Helvetica / Helvetica-Bold), no embedding.
 *    These are guaranteed available in every PDF viewer, so glyphs render with
 *    zero font data shipped.
 *  - Uncompressed (no FlateDecode) content streams — slightly larger files, but
 *    no zlib dependency and trivial to produce/debug.
 *  - WinAnsi text. Only ASCII is reliable; non-Latin glyphs are best-effort.
 *  - No image embedding (charts are drawn as native vector bars / pie sectors).
 *
 * Usage:
 *   const doc = new PdfDoc();
 *   doc.text('Hello', 72, doc.height - 72, { size: 18, bold: true });
 *   doc.line(72, 700, 540, 700);
 *   doc.addPage();
 *   const blob = doc.save();           // -> Blob (application/pdf)
 *   const bytes = doc.saveBytes();     // -> Uint8Array
 *
 * Coordinate system is PDF-native: origin is the BOTTOM-LEFT corner, y grows
 * upward. The report renderers track a top-down cursor and convert with
 * `doc.height - cursorY`.
 */

/** Options for a single `text()` call. */
export interface TextOptions {
  /** Font size in points. Default 11. */
  size?: number;
  /** Use Helvetica-Bold instead of Helvetica. Default false. */
  bold?: boolean;
  /** Fill color as [r,g,b] in 0..1. Default black. */
  color?: [number, number, number];
}

/** Approximate Helvetica character widths (per 1000 units), WinAnsi subset. */
const HELV_WIDTHS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278,
  '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500,
  d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222,
  m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556,
  v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584,
};
const DEFAULT_WIDTH = 556;

/**
 * Width of a string at a given font size, in points. Bold uses the same metrics
 * (close enough for wrapping; Helvetica-Bold is only marginally wider).
 */
export function textWidth(str: string, size: number): number {
  let w = 0;
  for (const ch of str) w += HELV_WIDTHS[ch] ?? DEFAULT_WIDTH;
  return (w / 1000) * size;
}

/** Escape a string for a PDF literal `( ... )` string operand. */
function escapePdfText(s: string): string {
  // Drop characters outside the printable WinAnsi range to avoid corrupt output.
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (code >= 32 && code <= 126) out += ch;
    else if (code === 8217 || code === 8216) out += "'"; // curly quotes
    else if (code === 8220 || code === 8221) out += '"';
    else if (code === 8211 || code === 8212) out += '-'; // en/em dash
    else if (code === 8226) out += '\\225'; // bullet (WinAnsi 149)
    else if (code === 160) out += ' ';
    else if (code > 126) out += '?';
    else out += ch;
  }
  return out;
}

/**
 * Word-wrap `text` to a maximum width, returning an array of lines. Words longer
 * than maxWidth are hard-broken so nothing overflows the page.
 */
export function wrapText(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (const word of words) {
      const trial = cur ? cur + ' ' + word : word;
      if (textWidth(trial, size) <= maxWidth || !cur) {
        // Hard-break a single oversized word.
        if (!cur && textWidth(word, size) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (textWidth(chunk + ch, size) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          cur = chunk;
        } else cur = trial;
      } else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

/**
 * A single PDF document being assembled. Each page accumulates a content-stream
 * string; `save()` stitches the pages, fonts, and cross-reference table into a
 * valid PDF byte stream.
 */
export class PdfDoc {
  /** Page width in points (letter). */
  readonly width = 612;
  /** Page height in points (letter). */
  readonly height = 792;

  /** Per-page content streams. Index 0 is the first page. */
  private pages: string[] = [''];
  private current = 0;

  /** Start a new blank page and make it current. */
  addPage(): void {
    this.pages.push('');
    this.current = this.pages.length - 1;
  }

  /** Number of pages so far. */
  get pageCount(): number {
    return this.pages.length;
  }

  /**
   * Draw a single line of text at (x, y) in PDF coordinates (y from bottom).
   * Does NOT wrap — callers wrap with `wrapText` and emit one line per call.
   */
  text(str: string, x: number, y: number, opts: TextOptions = {}): void {
    const size = opts.size ?? 11;
    const font = opts.bold ? 'F2' : 'F1';
    const [r, g, b] = opts.color ?? [0, 0, 0];
    const safe = escapePdfText(str);
    this.append(
      `${r} ${g} ${b} rg\nBT /${font} ${size} Tf 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm (${safe}) Tj ET\n`,
    );
  }

  /**
   * Draw a stroked line from (x1,y1) to (x2,y2).
   * @param w stroke width in points (default 0.5)
   * @param color stroke color [r,g,b] 0..1 (default light gray)
   */
  line(
    x1: number, y1: number, x2: number, y2: number,
    w = 0.5, color: [number, number, number] = [0.8, 0.8, 0.8],
  ): void {
    const [r, g, b] = color;
    this.append(
      `${r} ${g} ${b} RG ${fmt(w)} w\n${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S\n`,
    );
  }

  /**
   * Draw a filled rectangle with bottom-left corner (x, y), width `w`, height
   * `h`, in the given fill color (0..1 rgb, default black).
   */
  rect(
    x: number, y: number, w: number, h: number,
    color: [number, number, number] = [0, 0, 0],
  ): void {
    const [r, g, b] = color;
    this.append(`${r} ${g} ${b} rg\n${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re f\n`);
  }

  /**
   * Fill an arbitrary polygon given as [x,y] points (PDF coords). Used to draw
   * pie / donut sectors as triangle fans.
   */
  polygon(points: [number, number][], color: [number, number, number] = [0, 0, 0]): void {
    if (points.length < 3) return;
    const [r, g, b] = color;
    let path = `${r} ${g} ${b} rg\n${fmt(points[0][0])} ${fmt(points[0][1])} m\n`;
    for (let i = 1; i < points.length; i++) path += `${fmt(points[i][0])} ${fmt(points[i][1])} l\n`;
    path += 'f\n';
    this.append(path);
  }

  /**
   * Draw a filled pie/donut sector centered at (cx,cy) spanning [a0,a1] radians,
   * approximated by a triangle fan. If `rInner > 0` an inner wedge of the page
   * background color is overdrawn to create the donut hole.
   */
  sector(
    cx: number, cy: number, rOuter: number, a0: number, a1: number,
    color: [number, number, number], rInner = 0,
    bg: [number, number, number] = [1, 1, 1],
  ): void {
    const steps = Math.max(2, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 48));
    const outer: [number, number][] = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      outer.push([cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter]);
    }
    this.polygon(outer, color);
    if (rInner > 0) {
      const inner: [number, number][] = [[cx, cy]];
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        inner.push([cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner]);
      }
      this.polygon(inner, bg);
    }
  }

  /** Append raw content-stream operators to the current page. */
  private append(s: string): void {
    this.pages[this.current] += s;
  }

  /** Serialize the document to a Uint8Array of valid PDF bytes. */
  saveBytes(): Uint8Array {
    const objects: string[] = [];
    // Object numbering: 1=Catalog, 2=Pages, 3=Font Helvetica, 4=Font Bold,
    // then per page: a Page object and its Content stream object.
    const pageObjNums: number[] = [];
    const contentObjNums: number[] = [];
    let nextObj = 5;
    for (let i = 0; i < this.pages.length; i++) {
      pageObjNums.push(nextObj++);
      contentObjNums.push(nextObj++);
    }

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] =
      `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageObjNums
        .map((n) => `${n} 0 R`)
        .join(' ')}] >>`;
    objects[3] =
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[4] =
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

    for (let i = 0; i < this.pages.length; i++) {
      const content = this.pages[i] || '';
      const bytes = utf8Len(content);
      objects[pageObjNums[i]] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNums[i]} 0 R >>`;
      objects[contentObjNums[i]] =
        `<< /Length ${bytes} >>\nstream\n${content}endstream`;
    }

    // Assemble body, tracking byte offsets for the xref table.
    let pdf = '%PDF-1.4\n%âãÏÓ\n';
    const offsets: number[] = [];
    const totalObjs = nextObj - 1;
    for (let n = 1; n <= totalObjs; n++) {
      offsets[n] = utf8Len(pdf);
      pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
    }

    const xrefStart = utf8Len(pdf);
    let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= totalObjs; n++) {
      xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += xref;
    pdf += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    return strToBytes(pdf);
  }

  /** Serialize the document to a Blob (application/pdf). */
  save(): Blob {
    return new Blob([this.saveBytes() as BlobPart], { type: 'application/pdf' });
  }
}

/** Format a number for PDF output (trim to 3 decimals, no exponent). */
function fmt(n: number): string {
  if (!isFinite(n)) return '0';
  return (Math.round(n * 1000) / 1000).toString();
}

/** UTF-8 byte length of a string (content-stream /Length must be byte count). */
function utf8Len(s: string): number {
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) len += 1;
    else if (c < 0x800) len += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { len += 4; i++; }
    else len += 3;
  }
  return len;
}

/** Encode a string to UTF-8 bytes. */
function strToBytes(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(bytes);
}
