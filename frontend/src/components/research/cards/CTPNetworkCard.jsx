// CTPNetworkCard — Compound → Target → Pathway master graph with live
// top-N pathway re-filter sliders and first-degree neighborhood isolation.
import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { FileText, FileJson, ImageDown } from "lucide-react";
import { trigger } from "./_helpers";
import { downloadCytoscapePublicationPng } from "@/lib/publicationExport";

export function CTPNetworkCard({ data, message }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  const serverNodes = useMemo(() => data?.nodes || [], [data?.nodes]);
  const serverEdges = useMemo(() => data?.edges || [], [data?.edges]);
  const metrics     = useMemo(() => data?.metrics || {}, [data?.metrics]);
  const exports = data?.exports || {};
  const raw = data?.raw || null;

  const keggAvail = metrics.kegg_available ?? (raw?.kegg?.length || 0);
  const goAvail   = metrics.go_available   ?? (raw?.go?.length   || 0);
  const maxAdjP   = metrics.max_adj_p ?? 0.05;
  const [topKegg, setTopKegg] = useState(metrics.top_kegg_used ?? 20);
  const [topGo,   setTopGo]   = useState(metrics.top_go_used   ?? 20);
  const [isolatedNodeId, setIsolatedNodeId] = useState(null);

  const { nodes, edges, liveMetrics } = useMemo(() => {
    if (!raw) {
      return { nodes: serverNodes, edges: serverEdges, liveMetrics: metrics };
    }

    const pwScore = (pw) => {
      const p = pw?.adjusted_p_value ?? pw?.adj_p_value ?? pw?.p_value ?? 1.0;
      const n = parseFloat(p);
      return Number.isFinite(n) ? n : 1.0;
    };
    const topN = (rows, k) => {
      const filt = (rows || []).filter((r) => pwScore(r) <= maxAdjP);
      filt.sort((a, b) => pwScore(a) - pwScore(b));
      return filt.slice(0, k);
    };

    const keggTop = topN(raw.kegg, topKegg);
    const goTop   = topN(raw.go,   topGo);

    const compounds = new Set();
    const targets   = new Set();
    const ctEdges   = [];
    for (const t of raw.targets || []) {
      const c = (t.compound_name || t.query_compound || "").trim();
      const g = (t.gene || t.gene_symbol || t.symbol || "").trim().toUpperCase();
      if (!c || !g) continue;
      compounds.add(c); targets.add(g);
      ctEdges.push({ source: c, target: g, interaction: "targets" });
    }

    const pathways = new Set();
    const tpEdges  = [];
    for (const pw of [...keggTop, ...goTop]) {
      const pname = (pw.term_name || pw.name || pw.term || "").trim();
      if (!pname) continue;
      for (const gene of pw.overlap_genes || []) {
        const g = (gene || "").trim().toUpperCase();
        if (!g) continue;
        pathways.add(pname);
        tpEdges.push({ source: g, target: pname, interaction: "involved_in" });
      }
    }

    const seen = new Set();
    const allEdges = [...ctEdges, ...tpEdges].filter((e) => {
      const k = `${e.source}→${e.target}→${e.interaction}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    const nodeMap = new Map();
    const addNode = (id, type) => {
      if (!nodeMap.has(id)) nodeMap.set(id, { id, label: id, type, degree: 0 });
    };
    compounds.forEach((c) => addNode(c, "Compound"));
    targets.forEach((t)   => addNode(t, "Target"));
    pathways.forEach((p)  => addNode(p, "Pathway"));
    for (const e of allEdges) {
      if (!nodeMap.has(e.source)) addNode(e.source, "Target");
      if (!nodeMap.has(e.target)) {
        addNode(e.target, e.interaction === "involved_in" ? "Pathway" : "Target");
      }
      nodeMap.get(e.source).degree += 1;
      nodeMap.get(e.target).degree += 1;
    }

    const nodesArr = Array.from(nodeMap.values());
    return {
      nodes: nodesArr,
      edges: allEdges,
      liveMetrics: {
        ...metrics,
        n_compounds: compounds.size,
        n_targets:   targets.size,
        n_pathways:  pathways.size,
        n_nodes:     nodesArr.length,
        n_edges:     allEdges.length,
        top_kegg_used: keggTop.length,
        top_go_used:   goTop.length,
      },
    };
  }, [raw, topKegg, topGo, maxAdjP, serverNodes, serverEdges, metrics]);

  useEffect(() => {
    if (!ref.current || !nodes.length) return;
    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...nodes.map((n) => ({ data: {
          id: n.id, label: n.label, type: n.type, degree: n.degree,
        }})),
        ...edges.map((e, i) => ({ data: {
          id: `e${i}`, source: e.source, target: e.target,
          interaction: e.interaction,
        }})),
      ],
      style: [
        { selector: "node[type='Compound']", style: {
            "background-color": "#5139ED", "shape": "hexagon",
            "label": "data(label)", "color": "#e0e0ff", "font-size": 10,
            "text-outline-color": "#0B0B18", "text-outline-width": 2,
            "text-valign": "center", "text-halign": "center",
            "width":  (n) => 22 + Math.min(20, (n.data("degree") || 1) * 1.8),
            "height": (n) => 22 + Math.min(20, (n.data("degree") || 1) * 1.8) } },
        { selector: "node[type='Target']", style: {
            "background-color": "#2BB673", "shape": "ellipse",
            "label": "data(label)", "color": "#d0ffd0", "font-size": 9,
            "text-outline-color": "#0B0B18", "text-outline-width": 2,
            "text-valign": "center", "text-halign": "center",
            "width":  (n) => 18 + Math.min(18, (n.data("degree") || 1) * 1.6),
            "height": (n) => 14 + Math.min(14, (n.data("degree") || 1) * 1.2) } },
        { selector: "node[type='Pathway']", style: {
            "background-color": "#F5B301", "shape": "diamond",
            "label": "data(label)", "color": "#fef3c7", "font-size": 9,
            "text-outline-color": "#0B0B18", "text-outline-width": 2,
            "text-valign": "center", "text-halign": "center",
            "width":  (n) => 20 + Math.min(18, (n.data("degree") || 1) * 1.4),
            "height": (n) => 20 + Math.min(18, (n.data("degree") || 1) * 1.4) } },
        { selector: "edge", style: {
            "width": 1, "line-color": "#8139ED", "line-opacity": 0.28,
            "curve-style": "bezier", "target-arrow-shape": "none" } },
        { selector: "edge[interaction='involved_in']", style: {
            "line-color": "#F5B301", "line-opacity": 0.28 } },
        { selector: ".dimmed", style: {
            "opacity": 0.08, "text-opacity": 0 } },
        { selector: ".focus", style: {
            "border-width": 3, "border-color": "#FDE68A",
            "text-outline-color": "#F59E0B", "text-outline-width": 2,
            "font-size": 12, "z-index": 999 } },
        { selector: ".neighbor", style: {
            "border-width": 2, "border-color": "#FDE68A", "opacity": 1 } },
        { selector: "edge.highlight", style: {
            "line-color": "#FDE68A", "line-opacity": 0.95, "width": 2.5,
            "z-index": 998 } },
      ],
      // Concentric 3-tier layout — Pathway (inner) · Target (middle) ·
      // Compound (outer). Guaranteed non-overlapping, publication-clean.
      layout: {
        name: "concentric",
        concentric: (n) => {
          const t = n.data("type");
          if (t === "Pathway")  return 3 + (n.data("degree") || 0);
          if (t === "Target")   return 2 + (n.data("degree") || 0);
          return 1 + (n.data("degree") || 0);  // Compound outermost
        },
        levelWidth: () => 1,
        minNodeSpacing: 22,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        animate: false,
        padding: 40,
        equidistant: false,
      },
      textureOnViewport: true, motionBlur: false, pixelRatio: 1,
    });
    cy.autoungrabify(true);

    cy.on("tap", "node", (evt) => {
      const id = evt.target.id();
      setIsolatedNodeId((prev) => (prev === id ? null : id));
    });
    cy.on("tap", (evt) => { if (evt.target === cy) setIsolatedNodeId(null); });

    cyRef.current = cy;
    return () => cy.destroy();
  }, [nodes, edges]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("dimmed focus neighbor highlight");
      if (!isolatedNodeId) return;
      const focus = cy.getElementById(isolatedNodeId);
      if (focus.empty()) return;
      const neigh = focus.neighborhood();
      const keep  = focus.union(neigh);
      cy.elements().not(keep).addClass("dimmed");
      focus.addClass("focus");
      neigh.nodes().addClass("neighbor");
      neigh.edges().addClass("highlight");
    });
  }, [isolatedNodeId, nodes, edges]);

  const dl = (fname) => {
    const txt = exports?.[fname]; if (!txt) return;
    const isJson = fname.endsWith(".json");
    trigger(new Blob([txt], {
      type: isJson ? "application/json"
                   : fname.endsWith(".graphml") ? "application/xml"
                   : "text/csv;charset=utf-8;",
    }), fname);
  };

  return (
    <div data-testid="ctp-network-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <div className="text-[15px] font-semibold text-slate-100">Compound → Target → Pathway Network</div>
        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
          {liveMetrics.n_nodes} nodes · {liveMetrics.n_edges} edges
        </span>
      </div>
      <div className="text-[11.5px] text-slate-400 mb-3">{message}</div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {[
          { label: "Compounds", value: liveMetrics.n_compounds, color: "text-[#a48bff]" },
          { label: "Targets",   value: liveMetrics.n_targets,   color: "text-emerald-300" },
          { label: liveMetrics.top_kegg_used != null
                    ? `Top Pathways (${(liveMetrics.top_kegg_used ?? 0) + (liveMetrics.top_go_used ?? 0)}/${(keggAvail + goAvail)})`
                    : "Pathways",
            value: liveMetrics.n_pathways, color: "text-amber-300" },
          { label: "Nodes",     value: liveMetrics.n_nodes,     color: "text-slate-100" },
          { label: "Edges",     value: liveMetrics.n_edges,     color: "text-slate-100" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-center">
            <div className={`text-[18px] font-bold ${s.color}`}>{s.value ?? "—"}</div>
            <div className="text-[10.5px] uppercase tracking-widest text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {raw && (keggAvail > 0 || goAvail > 0) && (
        <div data-testid="ctp-slider-panel"
             className="mb-3 rounded-lg border border-white/5 bg-black/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-300">
              Adjust top-N pathways · adj-p ≤ {maxAdjP}
            </div>
            <button data-testid="ctp-reset-topn"
                    onClick={() => {
                      setTopKegg(Math.min(20, keggAvail));
                      setTopGo(Math.min(20, goAvail));
                    }}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/10">
              Reset
            </button>
          </div>

          {keggAvail > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Top KEGG pathways</span>
                <span className="font-mono text-amber-300">{topKegg} / {keggAvail}</span>
              </div>
              <input data-testid="ctp-slider-kegg"
                     type="range" min={0} max={keggAvail} step={1} value={topKegg}
                     onChange={(e) => setTopKegg(parseInt(e.target.value, 10) || 0)}
                     className="w-full accent-amber-400" />
            </div>
          )}

          {goAvail > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Top GO terms</span>
                <span className="font-mono text-amber-300">{topGo} / {goAvail}</span>
              </div>
              <input data-testid="ctp-slider-go"
                     type="range" min={0} max={goAvail} step={1} value={topGo}
                     onChange={(e) => setTopGo(parseInt(e.target.value, 10) || 0)}
                     className="w-full accent-amber-400" />
            </div>
          )}
          <div className="mt-1 text-[10px] text-slate-500">
            Tip: click any node in the graph to isolate its neighborhood — click empty space to reset.
          </div>
        </div>
      )}

      {isolatedNodeId && (
        <div data-testid="ctp-isolation-banner"
             className="mb-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
          <span>
            Isolating <span className="font-mono font-semibold">{isolatedNodeId}</span> and its first-degree neighborhood.
          </span>
          <button data-testid="ctp-clear-isolation"
                  onClick={() => setIsolatedNodeId(null)}
                  className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/20">
            Clear
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-2 text-[10.5px] text-slate-400">
        <span><span className="inline-block h-2.5 w-2.5 bg-[#5139ED] mr-1" style={{ clipPath: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)" }} />Compounds (hexagons)</span>
        <span><span className="inline-block h-2 w-3 rounded-full bg-[#2BB673] mr-1" />Targets (ellipses)</span>
        <span><span className="inline-block h-2 w-2 rotate-45 bg-[#F5B301] mr-1" />Pathways (diamonds)</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button data-testid="ctp-download-nodes-csv" onClick={() => dl("ctp_nodes.csv")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> nodes.csv
          </button>
          <button data-testid="ctp-download-edges-csv" onClick={() => dl("ctp_edges.csv")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> edges.csv
          </button>
          <button data-testid="ctp-download-graphml" onClick={() => dl("ctp_network.graphml")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> GraphML
          </button>
          <button data-testid="ctp-download-json" onClick={() => dl("ctp_network.json")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileJson size={10} /> JSON
          </button>
          <button data-testid="ctp-download-png"
            onClick={() => {
              const cy = cyRef.current; if (!cy) return;
              const url = cy.png({ bg: "#0B0B18", scale: 2, full: true });
              const a = document.createElement("a");
              a.href = url; a.download = "ctp_network.png"; a.click();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> PNG
          </button>
          <button data-testid="ctp-download-publication-png"
            title="Publication-quality PNG on a clean white background"
            onClick={() => downloadCytoscapePublicationPng(
              cyRef.current, "ctp_network_publication.png"
            )}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10.5px] font-semibold text-emerald-200 hover:bg-emerald-500/20">
            <ImageDown size={10} /> Publication PNG
          </button>
        </div>
      </div>

      <div ref={ref} data-testid="ctp-network-canvas"
           className="w-full h-[500px] rounded-lg border border-white/5 bg-black/40" />

      {(() => {
        const topHubs = raw
          ? [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 10)
          : (metrics.top_by_degree || []);
        if (!topHubs.length) return null;
        return (
          <div className="mt-3">
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Top hubs by degree
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topHubs.map((h, i) => {
                const tint = h.type === "Compound" ? "text-[#a48bff] border-[#5139ED]/40 bg-[#5139ED]/10"
                           : h.type === "Target"   ? "text-emerald-200 border-emerald-500/40 bg-emerald-500/10"
                           : "text-amber-200 border-amber-500/40 bg-amber-500/10";
                return (
                  <button key={h.id || i}
                        data-testid={`ctp-hub-${i}`}
                        onClick={() => setIsolatedNodeId(h.id)}
                        title="Click to isolate this node's neighborhood"
                        className={`inline-flex items-center gap-1 rounded-full border ${tint} px-2 py-0.5 text-[11px] font-semibold hover:brightness-125`}>
                    {h.id} <span className="text-slate-500 text-[10px]">·{h.degree}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
