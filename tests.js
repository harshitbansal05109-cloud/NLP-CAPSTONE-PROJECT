/*
 * tests.js  -  run with:  node tests.js
 * Checks both algorithms on a known example and on many random networks.
 */
global.performance = global.performance || require('perf_hooks').performance;
const MST = require('./algorithms.js');

let passed = 0, failed = 0;
function check(name, condition) {
  if (condition) { passed++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name); }
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* 1. The worked example from the project report (expected total cost = 11) */
const locations = ['Warehouse', 'Shop A', 'Shop B', 'Shop C', 'Shop D'];
const routes = [
  { source: 'Warehouse', target: 'Shop A', weight: 4 },
  { source: 'Warehouse', target: 'Shop B', weight: 2 },
  { source: 'Shop A', target: 'Shop B', weight: 1 },
  { source: 'Shop A', target: 'Shop C', weight: 5 },
  { source: 'Shop B', target: 'Shop C', weight: 8 },
  { source: 'Shop B', target: 'Shop D', weight: 10 },
  { source: 'Shop C', target: 'Shop D', weight: 3 }
];
const k = MST.kruskal(locations, routes);
const p = MST.prim(locations, routes, 'Warehouse');
check('Kruskal total cost is 11', k.totalCost === 11);
check('Prim total cost is 11', p.totalCost === 11);
check('Kruskal selects V-1 = 4 routes', k.edges.length === 4);
check('Prim selects V-1 = 4 routes', p.edges.length === 4);
check('Both report a connected network', k.connected && p.connected);
check('Both pick the same routes (all weights distinct)', MST.sameEdgeSet(k.edges, p.edges));

/* 2. Disconnected network: Shop D has no route */
const k2 = MST.kruskal(locations, routes.slice(0, 4));
const p2 = MST.prim(locations, routes.slice(0, 4), 'Warehouse');
check('Disconnected network is detected by Kruskal', k2.connected === false);
check('Disconnected network is detected by Prim', p2.connected === false);

/* 3. Single location and no routes */
check('Single location: cost 0, connected', MST.kruskal(['A'], []).connected && MST.prim(['A'], []).totalCost === 0);

/* 4. Equal weights: edges may differ, total cost must be identical */
const eqLoc = ['A', 'B', 'C', 'D'];
const eqRoutes = [
  { source: 'A', target: 'B', weight: 1 }, { source: 'B', target: 'C', weight: 1 },
  { source: 'C', target: 'D', weight: 1 }, { source: 'A', target: 'D', weight: 1 },
  { source: 'A', target: 'C', weight: 1 }
];
check('Equal weights give equal cost (3)', MST.kruskal(eqLoc, eqRoutes).totalCost === 3 && MST.prim(eqLoc, eqRoutes).totalCost === 3);

/* 5. Many random networks of every size / density: costs must always match */
let allMatch = true, runs = 0;
for (const n of [2, 5, 10, 50, 100, 300]) {
  for (const density of ['sparse', 'medium', 'dense']) {
    for (let seed = 1; seed <= 5; seed++) {
      const g = MST.generateRandomGraph(n, MST.edgeCountFor(n, density), { seed });
      const a = MST.kruskal(g.locations, g.routes);
      const b = MST.prim(g.locations, g.routes);
      runs++;
      if (!near(a.totalCost, b.totalCost) || !a.connected || !b.connected ||
          a.edges.length !== n - 1 || b.edges.length !== n - 1) {
        allMatch = false;
        console.log('  mismatch at n=' + n + ' ' + density + ' seed=' + seed);
      }
    }
  }
}
check('Prim and Kruskal agree on ' + runs + ' random networks', allMatch);

/* 6. Union-Find */
const uf = new MST.UnionFind(4);
check('UnionFind merges different sets', uf.union(0, 1) === true);
check('UnionFind rejects same set (cycle)', uf.union(1, 0) === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
