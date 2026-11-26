/*
 * algorithms.js
 * Delivery Network Optimization Using MST
 *
 * Contains everything that is pure logic (no HTML, no DOM):
 *   - UnionFind  : disjoint-set structure used by Kruskal's algorithm
 *   - MinHeap    : priority queue used by Prim's algorithm
 *   - kruskal()  : Kruskal's algorithm
 *   - prim()     : Prim's algorithm (lazy version with a min-heap)
 *   - measure()  : average execution time over repeated runs
 *   - generateRandomGraph() : random connected network for experiments
 *
 * Input format used everywhere:
 *   locations : ["Warehouse", "Shop A", ...]
 *   routes    : [{ source: "Warehouse", target: "Shop A", weight: 4 }, ...]
 */
(function (root) {
  'use strict';

  /* ---------- Union-Find (path compression + union by rank) ---------- */
  class UnionFind {
    constructor(n) {
      this.parent = new Int32Array(n);
      this.rank = new Uint8Array(n);
      for (let i = 0; i < n; i++) this.parent[i] = i;
    }
    find(x) {
      let r = x;
      while (this.parent[r] !== r) r = this.parent[r];
      while (this.parent[x] !== r) {          // path compression
        const next = this.parent[x];
        this.parent[x] = r;
        x = next;
      }
      return r;
    }
    // Returns true if the two sets were different and are now merged.
    union(a, b) {
      const ra = this.find(a);
      const rb = this.find(b);
      if (ra === rb) return false;
      if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
      else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
      else { this.parent[rb] = ra; this.rank[ra]++; }
      return true;
    }
  }

  /* ---------- Binary min-heap (ordered by item.w) ---------- */
  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item) {
      const a = this.items;
      a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].w <= a[i].w) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.items;
      const top = a[0];
      const last = a.pop();
      if (a.length > 0) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && a[l].w < a[m].w) m = l;
          if (r < a.length && a[r].w < a[m].w) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    }
  }

  /* ---------- Convert names to indexes so the algorithms work on numbers ---------- */
  function prepare(locations, routes) {
    const index = new Map();
    locations.forEach((name, i) => index.set(name, i));
    const edges = [];
    for (const r of routes) {
      const u = index.get(r.source);
      const v = index.get(r.target);
      if (u === undefined || v === undefined || u === v) continue;
      edges.push({ u, v, w: Number(r.weight), source: r.source, target: r.target });
    }
    return { index, edges, n: locations.length };
  }

  function publicEdge(e) {
    return { source: e.source, target: e.target, weight: e.w };
  }

  /* ---------- Kruskal's algorithm: O(E log E) ---------- */
  function kruskal(locations, routes) {
    const { edges, n } = prepare(locations, routes);
    const sorted = edges.slice().sort((a, b) => a.w - b.w);   // 1. sort by weight
    const uf = new UnionFind(n);                              // 2. every vertex alone
    const chosen = [];
    let totalCost = 0;
    let examined = 0;

    for (const e of sorted) {                                 // 3. cheapest first
      if (chosen.length === n - 1) break;
      examined++;
      if (uf.union(e.u, e.v)) {                               // different groups -> no cycle
        chosen.push(e);
        totalCost += e.w;
      }
    }
    return {
      algorithm: 'Kruskal',
      edges: chosen.map(publicEdge),
      totalCost,
      connected: n > 0 && chosen.length === n - 1,
      components: n - chosen.length,
      edgesExamined: examined,
      vertexCount: n
    };
  }

  /* ---------- Prim's algorithm (adjacency list + min-heap): O(E log V) ---------- */
  function prim(locations, routes, startName) {
    const { index, edges, n } = prepare(locations, routes);
    const adj = Array.from({ length: n }, () => []);          // adjacency list
    for (const e of edges) {
      adj[e.u].push({ to: e.v, w: e.w, edge: e });
      adj[e.v].push({ to: e.u, w: e.w, edge: e });
    }

    const start = index.has(startName) ? index.get(startName) : 0;
    const visited = new Uint8Array(n);
    const heap = new MinHeap();
    const chosen = [];
    let totalCost = 0;
    let examined = 0;
    let reached = n > 0 ? 1 : 0;

    if (n > 0) {
      visited[start] = 1;
      for (const a of adj[start]) heap.push(a);
      while (heap.size > 0 && reached < n) {
        const cur = heap.pop();
        examined++;
        if (visited[cur.to]) continue;                        // would form a cycle
        visited[cur.to] = 1;
        reached++;
        chosen.push(cur.edge);
        totalCost += cur.w;
        for (const a of adj[cur.to]) if (!visited[a.to]) heap.push(a);
      }
    }
    return {
      algorithm: 'Prim',
      edges: chosen.map(publicEdge),
      totalCost,
      connected: n > 0 && reached === n,
      reached,
      edgesExamined: examined,
      vertexCount: n
    };
  }

  /* ---------- Timing: average over many runs (one run is too short to measure) ---------- */
  function measure(fn, repeats) {
    fn();                                                      // warm-up run
    const t0 = performance.now();
    for (let i = 0; i < repeats; i++) fn();
    return (performance.now() - t0) / repeats;                 // milliseconds per run
  }

  function repeatsFor(vertexCount, edgeCount) {
    const size = vertexCount + edgeCount;
    return Math.max(3, Math.min(2000, Math.floor(300000 / Math.max(size, 1))));
  }

  /* ---------- Random network generator ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Number of routes for a given size and density type.
  function edgeCountFor(n, density) {
    const max = (n * (n - 1)) / 2;
    let e;
    if (density === 'sparse') e = 2 * n;
    else if (density === 'dense') e = 0.5 * max;
    else e = 0.1 * max;                                        // medium
    return Math.max(Math.min(n - 1, max), Math.min(max, Math.round(e)));
  }

  // Always returns a CONNECTED network: first a random spanning tree, then extra routes.
  function generateRandomGraph(n, edgeCount, options) {
    const opts = options || {};
    const rand = mulberry32(opts.seed === undefined ? 12345 : opts.seed);
    const prefix = opts.prefix || 'L';
    const maxW = opts.maxWeight || 100;
    const locations = [];
    for (let i = 1; i <= n; i++) locations.push(prefix + i);

    const used = new Set();
    const routes = [];
    const weight = () => 1 + Math.floor(rand() * maxW);
    const add = (i, j) => {
      const a = Math.min(i, j), b = Math.max(i, j);
      used.add(a * n + b);
      routes.push({ source: locations[a], target: locations[b], weight: weight() });
    };

    for (let i = 1; i < n; i++) add(i, Math.floor(rand() * i)); // spanning tree keeps it connected

    const max = (n * (n - 1)) / 2;
    const target = Math.min(Math.max(edgeCount, n - 1), max);
    if (target > routes.length) {
      if (target > max * 0.3) {                                // dense: shuffle all remaining pairs
        const pairs = [];
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!used.has(i * n + j)) pairs.push([i, j]);
        for (let k = pairs.length - 1; k > 0; k--) {
          const r = Math.floor(rand() * (k + 1));
          [pairs[k], pairs[r]] = [pairs[r], pairs[k]];
        }
        for (let k = 0; routes.length < target && k < pairs.length; k++) add(pairs[k][0], pairs[k][1]);
      } else {                                                 // sparse: random picks
        while (routes.length < target) {
          const i = Math.floor(rand() * n);
          const j = Math.floor(rand() * n);
          if (i === j) continue;
          if (used.has(Math.min(i, j) * n + Math.max(i, j))) continue;
          add(i, j);
        }
      }
    }
    return { locations, routes };
  }

  function sameEdgeSet(a, b) {
    const key = e => [e.source, e.target].sort().join('||') + '||' + e.weight;
    if (a.length !== b.length) return false;
    const set = new Set(a.map(key));
    return b.every(e => set.has(key(e)));
  }

  const api = {
    UnionFind, MinHeap, kruskal, prim, measure, repeatsFor,
    generateRandomGraph, edgeCountFor, sameEdgeSet
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MST = api;
})(typeof window !== 'undefined' ? window : globalThis);
