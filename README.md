# Delivery Network Optimization Using MST

A single-page web application that connects delivery locations with the minimum total route cost,
using **Prim's** and **Kruskal's** minimum spanning tree algorithms, and compares them.

Built with HTML, CSS, JavaScript and Cytoscape.js. No backend, no database, no login.

## How to run

1. Keep all files in one folder.
2. Double-click `index.html` (any modern browser).
3. An internet connection is needed once per page load for Cytoscape.js (loaded from cdnjs) and the Manrope font.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure (7 sections) |
| `style.css` | Design and layout |
| `algorithms.js` | Union-Find, Min-Heap, Prim's, Kruskal's, timing, random graph generator (no DOM code) |
| `script.js` | Forms, validation, Local Storage, graph drawing, results and comparison |
| `tests.js` | Automated tests for the algorithms |

## How to use

1. Add locations (section 1).
2. Add routes with distances (section 2). Or click **Load sample network**.
3. See the graph (section 3).
4. Run Prim's (section 4) and Kruskal's (section 5). The chosen routes are highlighted on the graph.
5. Compare (section 6). Both must give the same total cost. The sample network gives 11.
6. Optional: run the benchmark (section 7) for larger random networks.

## Run the tests

Requires Node.js:

    node tests.js

## Implementation notes (useful for viva)

- **Kruskal's**: sort edges, Union-Find with path compression and union by rank, stop at V-1 edges. O(E log E).
- **Prim's**: adjacency list and a binary min-heap (lazy version). O(E log V).
- **Timing**: `performance.now()` around many repeated runs, then averaged. A single run on a small graph is too short to measure.
- **Fair comparison**: both algorithms receive the same edge list. Prim's builds its adjacency list inside the timed run and Kruskal's does its sort inside the timed run.
- **Disconnected network**: detected and reported, because no spanning tree exists.
- **Equal weights**: the two algorithms may choose different edges, but the total cost is always identical.
- An MST is a network design tool (cheapest way to connect everything). It is not a truck route and not a shortest path.
