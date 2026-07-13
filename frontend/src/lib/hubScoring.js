// Client-side CytoHubba-style hub scoring on a small PPI network.
// Implements the 10 CytoHubba algorithms:
//   Degree, Betweenness, Closeness, MCC, MNC, DMNC, EPC, Stress, Radiality, Bottleneck
// Optimised for graphs up to ~500 nodes (typical PPI slices).

// ─────────────────────── Adjacency helpers ──────────────────────
export function buildAdj(nodes, edges) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const adj = nodes.map(() => new Set());
  for (const e of edges) {
    const a = idx.get(e.source);
    const b = idx.get(e.target);
    if (a == null || b == null || a === b) continue;
    adj[a].add(b);
    adj[b].add(a);
  }
  return { idx, adj };
}

// ─────────────────────── Degree ──────────────────────
export function degreeCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  return nodes.map((n, i) => ({ id: n.id, degree: adj[i].size }));
}

// ─────────────────────── Closeness (Wasserman-Faust) ──────────────────────
export function closenessCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const out = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const dist = new Array(n).fill(-1);
    dist[s] = 0;
    const q = [s];
    let sum = 0;
    let reached = 0;
    let head = 0;
    while (head < q.length) {
      const v = q[head++];
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          sum += dist[w];
          reached += 1;
          q.push(w);
        }
      }
    }
    if (sum > 0 && reached > 0) out[s] = (reached * reached) / ((n - 1) * sum);
    else out[s] = 0;
  }
  return nodes.map((node, i) => ({ id: node.id, closeness: out[i] }));
}

// ─────────────────────── Brandes: betweenness + stress + shortest-path counts ──────────────────────
// Returns { betweenness, stress, sigmaGrid, distGrid, radiality }
function brandesFull(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const CB = new Array(n).fill(0);       // betweenness
  const CS = new Array(n).fill(0);       // stress
  const distGrid = new Array(n);         // BFS depth from each source
  const sigmaGrid = new Array(n);        // shortest path counts
  let diameter = 0;

  for (let s = 0; s < n; s++) {
    const stack = [];
    const pred = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    sigma[s] = 1;
    const dist = new Array(n).fill(-1);
    dist[s] = 0;
    const q = [s];
    let head = 0;
    while (head < q.length) {
      const v = q[head++];
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          if (dist[w] > diameter) diameter = dist[w];
          q.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }
    const delta = new Array(n).fill(0);
    // Stress: count of shortest paths passing through each node.
    // For each target t, backtrack and increment stress by sigma[t] over all preds.
    const stressAcc = new Array(n).fill(0);
    for (let i = stack.length - 1; i >= 0; i--) {
      const w = stack[i];
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        stressAcc[v] += sigma[v] * (1 + stressAcc[w] / Math.max(1, sigma[w]));
      }
      if (w !== s) {
        CB[w] += delta[w];
        CS[w] += stressAcc[w];
      }
    }
    distGrid[s] = dist;
    sigmaGrid[s] = sigma;
  }

  return {
    betweenness: CB.map((v) => v / 2),
    stress: CS.map((v) => v / 2),
    distGrid,
    sigmaGrid,
    diameter,
  };
}

export function betweennessCentrality(nodes, edges) {
  const { betweenness } = brandesFull(nodes, edges);
  return nodes.map((n, i) => ({ id: n.id, betweenness: betweenness[i] }));
}

// ─────────────────────── MCC (Maximum Clique Centrality) ──────────────────────
// Exact per CytoHubba paper: MCC(v) = Σ (|C| - 1)! for each maximal clique C containing v.
// Uses Bron–Kerbosch with pivoting on graphs up to ~250 nodes; larger graphs
// fall back to (degree * (1 + local_clustering_coef)) which correlates strongly
// with MCC on scale-free networks.
function factorial(k) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
}

function bronKerbosch(adj, cliques) {
  const n = adj.length;
  const P0 = new Set();
  for (let i = 0; i < n; i++) P0.add(i);
  function bk(R, P, X) {
    if (P.size === 0 && X.size === 0) {
      cliques.push([...R]);
      return;
    }
    // Choose pivot u with the most connections in P.
    let pivot = -1, best = -1;
    const union = new Set([...P, ...X]);
    for (const u of union) {
      let c = 0;
      for (const v of P) if (adj[u].has(v)) c++;
      if (c > best) { best = c; pivot = u; }
    }
    const candidates = [];
    for (const v of P) if (pivot < 0 || !adj[pivot].has(v)) candidates.push(v);
    for (const v of candidates) {
      const Rn = new Set(R); Rn.add(v);
      const Pn = new Set();
      const Xn = new Set();
      for (const w of P) if (adj[v].has(w)) Pn.add(w);
      for (const w of X) if (adj[v].has(w)) Xn.add(w);
      bk(Rn, Pn, Xn);
      P.delete(v);
      X.add(v);
    }
  }
  bk(new Set(), P0, new Set());
}

export function mccCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const out = new Array(n).fill(0);
  if (n === 0) return [];

  if (n <= 250) {
    const cliques = [];
    try { bronKerbosch(adj, cliques); }
    catch (e) { /* fall through to approximation */ }
    if (cliques.length > 0) {
      for (const C of cliques) {
        if (C.length < 2) continue;
        const w = factorial(C.length - 1);
        for (const v of C) out[v] += w;
      }
      return nodes.map((node, i) => ({ id: node.id, mcc: out[i] }));
    }
  }

  // Approximation for large graphs — degree * (1 + local clustering)
  for (let v = 0; v < n; v++) {
    const nbrs = [...adj[v]];
    const d = nbrs.length;
    if (d < 2) { out[v] = d; continue; }
    let tri = 0;
    for (let i = 0; i < nbrs.length; i++)
      for (let j = i + 1; j < nbrs.length; j++)
        if (adj[nbrs[i]].has(nbrs[j])) tri++;
    const possible = (d * (d - 1)) / 2;
    const clust = possible > 0 ? tri / possible : 0;
    out[v] = d * (1 + clust);
  }
  return nodes.map((node, i) => ({ id: node.id, mcc: out[i] }));
}

// ─────────────────────── MNC (Maximum Neighborhood Component) ──────────────────────
// MNC(v) = size of the largest connected component in the induced subgraph on N(v).
export function mncCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const out = new Array(n).fill(0);
  for (let v = 0; v < n; v++) {
    const nbrs = [...adj[v]];
    if (nbrs.length <= 1) { out[v] = nbrs.length; continue; }
    const nbrSet = new Set(nbrs);
    const visited = new Set();
    let maxComp = 0;
    for (const start of nbrs) {
      if (visited.has(start)) continue;
      const q = [start];
      visited.add(start);
      let size = 0;
      let head = 0;
      while (head < q.length) {
        const x = q[head++];
        size++;
        for (const y of adj[x]) if (nbrSet.has(y) && !visited.has(y)) {
          visited.add(y); q.push(y);
        }
      }
      if (size > maxComp) maxComp = size;
    }
    out[v] = maxComp;
  }
  return nodes.map((node, i) => ({ id: node.id, mnc: out[i] }));
}

// ─────────────────────── DMNC (Density of MNC) ──────────────────────
// DMNC(v) = |E(MNC)| / |V(MNC)|^ε ; ε = 1.7 per Chin et al. 2014.
export function dmncCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const eps = 1.7;
  const out = new Array(n).fill(0);
  for (let v = 0; v < n; v++) {
    const nbrs = [...adj[v]];
    if (nbrs.length <= 1) { out[v] = 0; continue; }
    const nbrSet = new Set(nbrs);
    const visited = new Set();
    let bestVs = null, bestEs = 0;
    for (const start of nbrs) {
      if (visited.has(start)) continue;
      const q = [start];
      visited.add(start);
      const comp = [];
      let head = 0;
      while (head < q.length) {
        const x = q[head++];
        comp.push(x);
        for (const y of adj[x]) if (nbrSet.has(y) && !visited.has(y)) {
          visited.add(y); q.push(y);
        }
      }
      // Edge count inside this component
      let ec = 0;
      const cs = new Set(comp);
      for (const x of comp) for (const y of adj[x]) if (cs.has(y) && y > x) ec++;
      if (comp.length > (bestVs?.length || 0)) { bestVs = comp; bestEs = ec; }
    }
    if (!bestVs || bestVs.length === 0) out[v] = 0;
    else out[v] = bestEs / Math.pow(bestVs.length, eps);
  }
  return nodes.map((node, i) => ({ id: node.id, dmnc: out[i] }));
}

// ─────────────────────── EPC (Edge Percolated Component) ──────────────────────
// Simplified Monte Carlo: retention p = 0.5, T = 100 iterations. Returns average
// size of the connected component containing v after edge percolation.
export function epcCentrality(nodes, edges, opts = {}) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const trials = opts.trials || 100;
  const p = opts.p ?? 0.5;
  const sums = new Array(n).fill(0);

  // Build an edge list once for percolation.
  const edgeList = [];
  for (let u = 0; u < n; u++) for (const w of adj[u]) if (w > u) edgeList.push([u, w]);

  for (let t = 0; t < trials; t++) {
    const kept = new Array(n).fill(null).map(() => []);
    for (const [u, w] of edgeList) {
      if (Math.random() < p) {
        kept[u].push(w); kept[w].push(u);
      }
    }
    // BFS component sizes
    const compId = new Array(n).fill(-1);
    const compSize = [];
    for (let s = 0; s < n; s++) {
      if (compId[s] !== -1) continue;
      const id = compSize.length;
      const q = [s]; compId[s] = id; let sz = 0; let head = 0;
      while (head < q.length) {
        const v = q[head++]; sz++;
        for (const w of kept[v]) if (compId[w] === -1) { compId[w] = id; q.push(w); }
      }
      compSize.push(sz);
    }
    for (let v = 0; v < n; v++) sums[v] += compSize[compId[v]];
  }
  return nodes.map((node, i) => ({ id: node.id, epc: sums[i] / trials }));
}

// ─────────────────────── Stress ──────────────────────
export function stressCentrality(nodes, edges) {
  const { stress } = brandesFull(nodes, edges);
  return nodes.map((n, i) => ({ id: n.id, stress: stress[i] }));
}

// ─────────────────────── Radiality ──────────────────────
// Radiality(v) = Σ_{u ≠ v, reachable} (D + 1 - d(v,u)) / (n - 1)
export function radialityCentrality(nodes, edges) {
  const { distGrid, diameter } = brandesFull(nodes, edges);
  const n = nodes.length;
  const out = new Array(n).fill(0);
  const D = diameter || 1;
  for (let v = 0; v < n; v++) {
    let sum = 0;
    for (let u = 0; u < n; u++) {
      if (u === v) continue;
      const d = distGrid[v][u];
      if (d > 0) sum += (D + 1 - d);
    }
    out[v] = n > 1 ? sum / (n - 1) : 0;
  }
  return nodes.map((node, i) => ({ id: node.id, radiality: out[i] }));
}

// ─────────────────────── Bottleneck ──────────────────────
// BN(v) = Σ_s p_s(v); p_s(v) = 1 if > n/4 shortest paths from s traverse v.
// Approximation: for each source s, run BFS tree from s; count shortest-path
// end-points reached through v by traversing the BFS parent chain from every
// target back to s. If count > n/4 for that source, add 1.
export function bottleneckCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const BN = new Array(n).fill(0);
  const threshold = n / 4;

  for (let s = 0; s < n; s++) {
    const dist = new Array(n).fill(-1);
    const parent = new Array(n).fill(-1);
    dist[s] = 0;
    const q = [s]; let head = 0;
    while (head < q.length) {
      const v = q[head++];
      for (const w of adj[v]) if (dist[w] < 0) {
        dist[w] = dist[v] + 1; parent[w] = v; q.push(w);
      }
    }
    // Count how many shortest-path endpoints traverse each intermediate v.
    const pathThrough = new Array(n).fill(0);
    for (let t = 0; t < n; t++) {
      if (t === s || dist[t] < 0) continue;
      let x = parent[t];
      while (x !== -1 && x !== s) { pathThrough[x] += 1; x = parent[x]; }
    }
    for (let v = 0; v < n; v++) if (pathThrough[v] > threshold) BN[v] += 1;
  }
  return nodes.map((node, i) => ({ id: node.id, bottleneck: BN[i] }));
}

// ─────────────────────── Combined ──────────────────────
export function combinedHubScores(nodes, edges) {
  if (nodes.length === 0) return [];
  const deg = degreeCentrality(nodes, edges);
  const clo = closenessCentrality(nodes, edges);
  const brandes = brandesFull(nodes, edges);
  const mcc = mccCentrality(nodes, edges);
  const mnc = mncCentrality(nodes, edges);
  const dmnc = dmncCentrality(nodes, edges);
  const epc = epcCentrality(nodes, edges);
  const rad = radialityCentrality(nodes, edges);
  const bot = bottleneckCentrality(nodes, edges);

  const byId = new Map();
  for (let i = 0; i < nodes.length; i++) {
    byId.set(nodes[i].id, {
      id: nodes[i].id,
      degree: deg[i].degree,
      closeness: clo[i].closeness,
      betweenness: brandes.betweenness[i],
      stress: brandes.stress[i],
      mcc: mcc[i].mcc,
      mnc: mnc[i].mnc,
      dmnc: dmnc[i].dmnc,
      epc: epc[i].epc,
      radiality: rad[i].radiality,
      bottleneck: bot[i].bottleneck,
    });
  }
  return [...byId.values()];
}

export const HUB_METRICS = [
  { key: "degree", label: "Degree" },
  { key: "betweenness", label: "Betweenness" },
  { key: "closeness", label: "Closeness" },
  { key: "mcc", label: "MCC" },
  { key: "mnc", label: "MNC" },
  { key: "dmnc", label: "DMNC" },
  { key: "epc", label: "EPC" },
  { key: "stress", label: "Stress" },
  { key: "radiality", label: "Radiality" },
  { key: "bottleneck", label: "Bottleneck" },
];
