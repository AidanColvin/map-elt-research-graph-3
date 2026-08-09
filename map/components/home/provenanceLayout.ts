/**
 * Geometry for the provenance diagram, as data.
 *
 * Two arrangements of the same five-records-into-one-document idea: a wide one
 * that reads left to right, and a narrow one that stacks so a phone never has to
 * scroll sideways. Both return the identical shape, so one component draws
 * either — and both are plain functions the unit tests can check.
 */

export type NodeBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the node's label baseline sits. */
  labelX: number;
  labelY: number;
};

export type DocBar = { x: number; y: number; w: number };

export type ProvenanceLayout = {
  /** Which arrangement this is. Carried explicitly so nothing downstream has to
      infer it from the geometry — both arrangements use similar node widths. */
  mode: "wide" | "narrow";
  viewBox: string;
  nodes: NodeBox[];
  /** One path per node, in the same order. */
  paths: string[];
  doc: { x: number; y: number; w: number; h: number };
  docLabel: { x: number; y: number };
  bars: DocBar[];
  /** The bar that carries citation 1, and where its superscript sits. */
  citeMark: { x: number; y: number };
  /** The dashed line from the superscript to the filing label. */
  tracePath: string;
  traceLabel: { x: number; y: number };
  traceCaption: { x: number; y: number };
};

const SOURCE_COUNT = 5;

/**
 * takes nothing
 * lays the five records down the left, converging into a document on the right
 * returns the wide-viewport geometry
 */
export function wideLayout(): ProvenanceLayout {
  const nodeW = 196;
  const nodeH = 46;
  const gap = 26;
  const top = 34;
  const docX = 620;
  const docY = 56;
  const docW = 252;
  const docH = 300;
  const joinY = docY + docH / 2;

  const nodes: NodeBox[] = [];
  const paths: string[] = [];
  for (let i = 0; i < SOURCE_COUNT; i++) {
    const y = top + i * (nodeH + gap);
    const cy = y + nodeH / 2;
    nodes.push({ x: 0, y, w: nodeW, h: nodeH, labelX: 16, labelY: cy + 4.5 });
    paths.push(
      `M ${nodeW} ${cy} C ${nodeW + 150} ${cy}, ${docX - 150} ${joinY}, ${docX} ${joinY}`,
    );
  }

  const barX = docX + 24;
  const bars: DocBar[] = [
    { x: barX, y: docY + 56, w: 204 },
    { x: barX, y: docY + 78, w: 176 },
    { x: barX, y: docY + 116, w: 196 },
    { x: barX, y: docY + 138, w: 148 },
    { x: barX, y: docY + 176, w: 204 },
    { x: barX, y: docY + 214, w: 132 },
  ];
  // Citation 1 hangs off the fourth bar, the shortest one in the middle block,
  // so the superscript has clear space to its right.
  const citeBar = bars[3];

  return {
    mode: "wide",
    viewBox: "0 0 1000 470",
    nodes,
    paths,
    doc: { x: docX, y: docY, w: docW, h: docH },
    docLabel: { x: barX, y: docY + 32 },
    bars,
    citeMark: { x: citeBar.x + citeBar.w + 5, y: citeBar.y + 6 },
    tracePath: `M ${citeBar.x + citeBar.w + 9} ${citeBar.y + 4} C ${docX + 250} ${docY + 250}, ${docX + 40} ${docY + 300}, ${docX + 4} ${docY + 350}`,
    traceLabel: { x: docX, y: docY + 372 },
    traceCaption: { x: docX, y: docY + 394 },
  };
}

/**
 * takes nothing
 * stacks the five records above the document, with the trace beneath it
 * returns the narrow-viewport geometry
 */
export function narrowLayout(): ProvenanceLayout {
  const nodeW = 244;
  const nodeH = 38;
  const gap = 12;
  const top = 6;
  const railX = 312;
  const docX = 8;
  const docY = 318;
  const docW = 344;
  const docH = 196;

  const nodes: NodeBox[] = [];
  const paths: string[] = [];
  for (let i = 0; i < SOURCE_COUNT; i++) {
    const y = top + i * (nodeH + gap);
    const cy = y + nodeH / 2;
    nodes.push({ x: docX, y, w: nodeW, h: nodeH, labelX: docX + 14, labelY: cy + 4.5 });
    // Each record leaves its own box to the right, turns onto a shared rail, and
    // runs down into the top of the document.
    paths.push(
      `M ${docX + nodeW} ${cy} C ${docX + nodeW + 40} ${cy}, ${railX} ${cy}, ${railX} ${cy + 22} L ${railX} ${docY}`,
    );
  }

  const barX = docX + 20;
  const bars: DocBar[] = [
    { x: barX, y: docY + 52, w: 260 },
    { x: barX, y: docY + 72, w: 214 },
    { x: barX, y: docY + 104, w: 244 },
    { x: barX, y: docY + 124, w: 168 },
    { x: barX, y: docY + 156, w: 236 },
  ];
  const citeBar = bars[3];

  return {
    mode: "narrow",
    viewBox: "0 0 360 620",
    nodes,
    paths,
    doc: { x: docX, y: docY, w: docW, h: docH },
    docLabel: { x: barX, y: docY + 30 },
    bars,
    citeMark: { x: citeBar.x + citeBar.w + 5, y: citeBar.y + 6 },
    tracePath: `M ${citeBar.x + citeBar.w + 9} ${citeBar.y + 4} C ${barX + 240} ${docY + 190}, ${barX + 60} ${docY + 210}, ${barX} ${docY + 232}`,
    traceLabel: { x: docX, y: docY + 254 },
    traceCaption: { x: docX, y: docY + 276 },
  };
}

/**
 * takes whether the viewport is narrow
 * picks the arrangement that fits it
 * returns the geometry to draw
 */
export function layoutFor(narrow: boolean): ProvenanceLayout {
  return narrow ? narrowLayout() : wideLayout();
}
