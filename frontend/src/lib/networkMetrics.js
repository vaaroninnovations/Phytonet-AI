// Global network metrics for the PCTDP or any Cytoscape-style graph.

export function computeNetworkMetrics(nodes, edges) {
  const n = nodes.length;
  const m = edges.length;
  if (n === 0) return {
    nodes: 0, edges: 0, avg_degree: 0, density: 0, components: 0,
    clustering: 0, avg_path_length: 0, diameter: 0,
  };

  const idx = new Map(nodes.map((x, i) => [x.id, i]));
  const adj = nodes.map(() => new Set());
  for (const e of edges) {
    const a = idx.get(e.source);
    const b = idx.get(e.target);
    if (a == null || b == null || a === b) continue;
    adj[a].add(b); adj[b].add(a);
  }

  const avg_degree = (2 * m) / n;
  const density = n > 1 ? (2 * m) / (n * (n - 1)) : 0;

  // Connected components
  const visited = new Array(n).fill(false);
  let components = 0;
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    components++;
    const q = [s]; visited[s] = true;
    let head = 0;
    while (head < q.length) {
      const v = q[head++];
      for (const w of adj[v]) if (!visited[w]) { visited[w] = true; q.push(w); }
    }
  }

  // Local clustering coefficient (undirected, simple)
  let clusteringSum = 0;
  for (let v = 0; v < n; v++) {
    const nbrs = [...adj[v]];
    const k = nbrs.length;
    if (k < 2) continue;
    let tri = 0;
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++)
        if (adj[nbrs[i]].has(nbrs[j])) tri++;
    clusteringSum += (2 * tri) / (k * (k - 1));
  }
  const clustering = n > 0 ? clusteringSum / n : 0;

  // BFS-based diameter & average shortest path length (largest CC only for efficiency)
  let diameter = 0; let pathSum = 0; let pathCount = 0;
  for (let s = 0; s < n; s++) {
    const dist = new Array(n).fill(-1);
    dist[s] = 0;
    const q = [s]; let head = 0;
    while (head < q.length) {
      const v = q[head++];
      for (const w of adj[v]) if (dist[w] < 0) { dist[w] = dist[v] + 1; q.push(w); }
    }
    for (let u = 0; u < n; u++) {
      if (u !== s && dist[u] > 0) {
        if (dist[u] > diameter) diameter = dist[u];
        pathSum += dist[u]; pathCount++;
      }
    }
  }
  const avg_path_length = pathCount > 0 ? pathSum / pathCount : 0;

  return { nodes: n, edges: m, avg_degree, density, components, clustering, avg_path_length, diameter };
}
