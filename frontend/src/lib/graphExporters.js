// PPI network exporters — GraphML, GML, XGMML, Cytoscape JSON.
// Input: { nodes: [{id, ...}], edges: [{source, target, score, channels?}] }
import { saveAs } from "file-saver";

const escapeXml = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function toGraphML({ nodes, edges }) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
  );
  lines.push('<key id="d0" for="node" attr.name="label" attr.type="string"/>');
  lines.push('<key id="d1" for="edge" attr.name="score" attr.type="double"/>');
  lines.push('<graph id="ppi" edgedefault="undirected">');
  for (const n of nodes) {
    lines.push(
      `<node id="${escapeXml(n.id)}"><data key="d0">${escapeXml(n.id)}</data></node>`
    );
  }
  edges.forEach((e, i) => {
    lines.push(
      `<edge id="e${i}" source="${escapeXml(e.source)}" target="${escapeXml(
        e.target
      )}"><data key="d1">${e.score ?? 0}</data></edge>`
    );
  });
  lines.push("</graph></graphml>");
  return lines.join("\n");
}

export function toGML({ nodes, edges }) {
  const lines = ["graph ["];
  lines.push("  directed 0");
  const idxOf = new Map();
  nodes.forEach((n, i) => {
    idxOf.set(n.id, i);
    lines.push("  node [");
    lines.push(`    id ${i}`);
    lines.push(`    label "${(n.id || "").replace(/"/g, '\\"')}"`);
    lines.push("  ]");
  });
  for (const e of edges) {
    const s = idxOf.get(e.source);
    const t = idxOf.get(e.target);
    if (s == null || t == null) continue;
    lines.push("  edge [");
    lines.push(`    source ${s}`);
    lines.push(`    target ${t}`);
    lines.push(`    weight ${e.score ?? 0}`);
    lines.push("  ]");
  }
  lines.push("]");
  return lines.join("\n");
}

export function toXGMML({ nodes, edges }, name = "PhytoNet-PPI") {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<graph label="${escapeXml(name)}" xmlns="http://www.cs.rpi.edu/XGMML" directed="0">`
  );
  for (const n of nodes) {
    lines.push(`  <node id="${escapeXml(n.id)}" label="${escapeXml(n.id)}"/>`);
  }
  edges.forEach((e) => {
    lines.push(
      `  <edge source="${escapeXml(e.source)}" target="${escapeXml(
        e.target
      )}" weight="${e.score ?? 0}"/>`
    );
  });
  lines.push("</graph>");
  return lines.join("\n");
}

export function toCytoscapeJSON({ nodes, edges }) {
  return JSON.stringify(
    {
      elements: {
        nodes: nodes.map((n) => ({ data: { id: n.id, ...n } })),
        edges: edges.map((e, i) => ({
          data: {
            id: `e${i}`,
            source: e.source,
            target: e.target,
            weight: e.score ?? 0,
            ...(e.channels || {}),
          },
        })),
      },
    },
    null,
    2
  );
}

export function downloadGraph(kind, graph, base = "ppi_network") {
  let content, ext, mime;
  switch (kind) {
    case "graphml":
      content = toGraphML(graph); ext = "graphml"; mime = "application/xml"; break;
    case "gml":
      content = toGML(graph); ext = "gml"; mime = "text/plain"; break;
    case "xgmml":
      content = toXGMML(graph); ext = "xgmml"; mime = "application/xml"; break;
    case "json":
    default:
      content = toCytoscapeJSON(graph); ext = "cyjs"; mime = "application/json"; break;
  }
  saveAs(new Blob([content], { type: `${mime};charset=utf-8` }), `${base}.${ext}`);
}
