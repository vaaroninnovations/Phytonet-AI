// Client-side CytoHubba-style hub scoring on a small PPI network.
// Implements Degree, Betweenness, Closeness (3 of the 10 algorithms).
// Betweenness uses Brandes' algorithm (O(V·E)) — fine up to a few thousand nodes.

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

export function degreeCentrality(nodes, edges) {
  const { idx, adj } = buildAdj(nodes, edges);
  const scores = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) scores[i] = adj[i].size;
  return nodes.map((n, i) => ({ id: n.id, degree: scores[i] }));
}

export function closenessCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const out = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    // BFS from s
    const dist = new Array(n).fill(-1);
    dist[s] = 0;
    const q = [s];
    let sum = 0;
    let reached = 0;
    while (q.length) {
      const v = q.shift();
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          sum += dist[w];
          reached += 1;
          q.push(w);
        }
      }
    }
    // Wasserman-Faust normalised closeness
    if (sum > 0 && reached > 0)
      out[s] = ((reached * reached) / ((n - 1) * sum));
    else out[s] = 0;
  }
  return nodes.map((node, i) => ({ id: node.id, closeness: out[i] }));
}

export function betweennessCentrality(nodes, edges) {
  const { adj } = buildAdj(nodes, edges);
  const n = nodes.length;
  const CB = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack = [];
    const pred = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    sigma[s] = 1;
    const dist = new Array(n).fill(-1);
    dist[s] = 0;
    const q = [s];
    while (q.length) {
      const v = q.shift();
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          q.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }
    const delta = new Array(n).fill(0);
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) CB[w] += delta[w];
    }
  }
  // Undirected → divide by 2
  return nodes.map((node, i) => ({ id: node.id, betweenness: CB[i] / 2 }));
}

export function combinedHubScores(nodes, edges) {
  const deg = degreeCentrality(nodes, edges);
  const clo = closenessCentrality(nodes, edges);
  const bet = betweennessCentrality(nodes, edges);
  const byId = new Map();
  for (const d of deg) byId.set(d.id, { id: d.id, degree: d.degree });
  for (const c of clo) Object.assign(byId.get(c.id), { closeness: c.closeness });
  for (const b of bet) Object.assign(byId.get(b.id), { betweenness: b.betweenness });
  return [...byId.values()];
}
