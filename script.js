/*
 * script.js
 * Delivery Network Optimization Using MST
 *
 * User interface logic: forms, Local Storage, graph drawing (Cytoscape.js),
 * running the algorithms from algorithms.js and showing / comparing results.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  const STORAGE_KEY = 'deliveryNetworkMST.v1';
  const COLORS = { prim: '#0e7c66', kruskal: '#c2410c', base: '#8a9aa2', ink: '#15222b' };

  const SAMPLE = {
    locations: ['Warehouse', 'Shop A', 'Shop B', 'Shop C', 'Shop D'],
    routes: [
      { source: 'Warehouse', target: 'Shop A', weight: 4 },
      { source: 'Warehouse', target: 'Shop B', weight: 2 },
      { source: 'Shop A', target: 'Shop B', weight: 1 },
      { source: 'Shop A', target: 'Shop C', weight: 5 },
      { source: 'Shop B', target: 'Shop C', weight: 8 },
      { source: 'Shop B', target: 'Shop D', weight: 10 },
      { source: 'Shop C', target: 'Shop D', weight: 3 }
    ]
  };

  const state = { locations: [], routes: [] };   // the network
  const results = { prim: null, kruskal: null }; // last algorithm results
  let cy = null;                                 // Cytoscape instance
  let edgeIdByKey = new Map();                   // "A||B" -> Cytoscape edge id

  const $ = id => document.getElementById(id);
  const routeKey = (a, b) => [a, b].sort().join('||');

  /* ------------------------------------------------------------------ *
   * Local Storage
   * ------------------------------------------------------------------ */
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage may be blocked */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.locations) || !Array.isArray(data.routes)) return;
      state.locations = data.locations.filter(s => typeof s === 'string');
      const known = new Set(state.locations);
      const seen = new Set();
      state.routes = [];
      for (const r of data.routes) {
        const w = Number(r.weight);
        if (!known.has(r.source) || !known.has(r.target) || r.source === r.target || !(w > 0)) continue;
        const k = routeKey(r.source, r.target);
        if (seen.has(k)) continue;
        seen.add(k);
        state.routes.push({ source: r.source, target: r.target, weight: w });
      }
    } catch (e) { /* ignore corrupted data */ }
  }

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function setMsg(id, text, type) {
    const el = $(id);
    el.textContent = text || '';
    el.className = 'msg' + (type ? ' ' + type : '');
  }

  function fmtNum(x) {
    return Number.isInteger(x) ? String(x) : String(Math.round(x * 10000) / 10000);
  }

  function fmtTime(ms) {
    if (ms < 0.01) return (ms * 1000).toFixed(1) + ' \u00b5s';
    return ms.toFixed(ms < 1 ? 3 : 2) + ' ms';
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) for (const k of Object.keys(props)) {
      if (k === 'text') node.textContent = props[k];
      else if (k === 'class') node.className = props[k];
      else node.setAttribute(k, props[k]);
    }
    (children || []).forEach(c => node.appendChild(c));
    return node;
  }

  /* ------------------------------------------------------------------ *
   * Locations
   * ------------------------------------------------------------------ */
  function addLocation(rawName) {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name) return 'Enter a location name.';
    if (name.length > 30) return 'Use 30 characters or fewer.';
    if (name.includes('||')) return 'The characters || are not allowed in a name.';
    if (state.locations.some(l => l.toLowerCase() === name.toLowerCase())) {
      return '"' + name + '" is already in the list.';
    }
    state.locations.push(name);
    networkChanged();
    return null;
  }

  function removeLocation(name) {
    state.locations = state.locations.filter(l => l !== name);
    state.routes = state.routes.filter(r => r.source !== name && r.target !== name);
    networkChanged();
  }

  function renderLocations() {
    const list = $('location-list');
    list.innerHTML = '';
    state.locations.forEach(name => {
      const btn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove ' + name, title: 'Remove ' + name, text: '\u00d7' });
      btn.addEventListener('click', () => {
        const used = state.routes.filter(r => r.source === name || r.target === name).length;
        if (used > 0 && !confirm('Removing "' + name + '" also removes its ' + plural(used, 'route') + '. Continue?')) return;
        removeLocation(name);
        setMsg('location-msg', '"' + name + '" removed.', 'ok');
      });
      list.appendChild(el('li', null, [el('span', { text: name }), btn]));
    });
    $('location-empty').classList.toggle('show', state.locations.length === 0);
  }

  function renderSelects() {
    ['route-source', 'route-target', 'prim-start'].forEach(id => {
      const sel = $(id);
      const previous = sel.value;
      sel.innerHTML = '';
      state.locations.forEach(name => sel.appendChild(el('option', { value: name, text: name })));
      if (state.locations.includes(previous)) sel.value = previous;
    });
    // make "To" different from "From" by default
    if (state.locations.length > 1 && $('route-source').value === $('route-target').value) {
      $('route-target').selectedIndex = 1;
    }
  }

  /* ------------------------------------------------------------------ *
   * Routes
   * ------------------------------------------------------------------ */
  function addRoute(source, target, rawWeight) {
    if (state.locations.length < 2) return 'Add at least two locations first.';
    if (!source || !target) return 'Choose both locations.';
    if (source === target) return 'A route must connect two different locations.';
    const weight = Number(rawWeight);
    if (rawWeight === '' || !Number.isFinite(weight) || weight <= 0) return 'Distance must be a number greater than 0.';
    const existing = state.routes.find(r => routeKey(r.source, r.target) === routeKey(source, target));
    if (existing) return 'That route already exists (distance ' + fmtNum(existing.weight) + '). Remove it first to change it.';
    state.routes.push({ source, target, weight });
    networkChanged();
    return null;
  }

  function renderRoutes() {
    const body = $('route-body');
    body.innerHTML = '';
    state.routes.forEach((r, i) => {
      const btn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove route ' + r.source + ' to ' + r.target, title: 'Remove route', text: '\u00d7' });
      btn.addEventListener('click', () => {
        state.routes.splice(i, 1);
        networkChanged();
        setMsg('route-msg', 'Route removed.', 'ok');
      });
      body.appendChild(el('tr', null, [
        el('td', { text: r.source }),
        el('td', { text: r.target }),
        el('td', { class: 'num-col', text: fmtNum(r.weight) }),
        el('td', null, [btn])
      ]));
    });
    $('route-empty').classList.toggle('show', state.routes.length === 0);
  }

  /* ------------------------------------------------------------------ *
   * Graph (Cytoscape.js)
   * ------------------------------------------------------------------ */
  function initGraph() {
    if (typeof cytoscape === 'undefined') {
      setMsg('graph-msg', 'The graph library (Cytoscape.js) could not be loaded. Check your internet connection and reload. The algorithms still work.', 'error');
      return;
    }
    cy = cytoscape({
      container: $('cy'),
      wheelSensitivity: 0.25,
      minZoom: 0.3,
      maxZoom: 3,
      style: [
        { selector: 'node', style: {
          'background-color': '#14304a', 'label': 'data(label)', 'color': COLORS.ink,
          'font-family': 'Manrope, system-ui, sans-serif', 'font-size': 13, 'font-weight': 600,
          'text-valign': 'bottom', 'text-margin-y': 6, 'width': 30, 'height': 30,
          'border-width': 3, 'border-color': '#ffffff',
          'text-background-color': '#ffffff', 'text-background-opacity': 0.8, 'text-background-padding': 2
        } },
        { selector: 'edge', style: {
          'width': 2, 'line-color': COLORS.base, 'curve-style': 'bezier',
          'label': 'data(weight)', 'font-size': 12, 'font-weight': 700, 'color': COLORS.ink,
          'text-background-color': '#ffffff', 'text-background-opacity': 1, 'text-background-padding': 3,
          'text-background-shape': 'roundrectangle', 'text-rotation': 'autorotate'
        } },
        { selector: 'edge.faded', style: { 'opacity': 0.35 } },
        { selector: 'edge.mst-prim', style: { 'width': 6, 'line-color': COLORS.prim, 'color': COLORS.prim } },
        { selector: 'edge.mst-kruskal', style: { 'width': 6, 'line-color': COLORS.kruskal, 'color': COLORS.kruskal } },
        { selector: 'node:selected', style: { 'background-color': '#2c5d8a' } }
      ]
    });
  }

  function updateGraph(relayout) {
    $('graph-stat').textContent = plural(state.locations.length, 'location') + ', ' + plural(state.routes.length, 'route');
    if (!cy) return;
    cy.elements().remove();
    edgeIdByKey = new Map();
    const elements = [];
    state.locations.forEach(name => elements.push({ group: 'nodes', data: { id: 'n:' + name, label: name } }));
    state.routes.forEach((r, i) => {
      const id = 'e' + i;
      edgeIdByKey.set(routeKey(r.source, r.target), id);
      elements.push({ group: 'edges', data: { id, source: 'n:' + r.source, target: 'n:' + r.target, weight: r.weight } });
    });
    cy.add(elements);
    if (relayout !== false) runLayout();
  }

  function runLayout() {
    if (!cy || cy.nodes().length === 0) return;
    const n = cy.nodes().length;
    let layout;
    if (n <= 2) layout = { name: 'grid' };
    else if (n <= 12) layout = { name: 'circle', animate: false, padding: 50 };   // clean and readable for small networks
    else layout = {
      name: 'cose', animate: false, padding: 40, randomize: true,
      nodeRepulsion: () => 60000, idealEdgeLength: () => 150, edgeElasticity: () => 80, numIter: 2000
    };
    cy.layout(layout).run();
    cy.fit(undefined, 40);
    if (cy.zoom() > 1.3) { cy.zoom(1.3); cy.center(); }   // do not over-zoom small networks
  }

  function clearHighlight() {
    if (cy) cy.edges().removeClass('faded mst-prim mst-kruskal');
  }

  function highlight(key, res) {
    if (!cy) return;
    clearHighlight();
    cy.edges().addClass('faded');
    res.edges.forEach(e => {
      const id = edgeIdByKey.get(routeKey(e.source, e.target));
      if (id) cy.getElementById(id).removeClass('faded').addClass('mst-' + key);
    });
  }

  /* ------------------------------------------------------------------ *
   * Running the algorithms
   * ------------------------------------------------------------------ */
  function canRun() {
    if (state.locations.length < 2) {
      setMsg('graph-msg', 'Add at least two locations and some routes before running an algorithm.', 'warn');
      return false;
    }
    if (state.routes.length === 0) {
      setMsg('graph-msg', 'Add routes between the locations before running an algorithm.', 'warn');
      return false;
    }
    setMsg('graph-msg', '', '');
    return true;
  }

  function execute(key) {
    const locs = state.locations.slice();
    const routes = state.routes.map(r => ({ source: r.source, target: r.target, weight: r.weight }));
    const start = $('prim-start').value;
    const fn = key === 'prim' ? () => MST.prim(locs, routes, start) : () => MST.kruskal(locs, routes);
    const res = fn();
    res.timeMs = MST.measure(fn, MST.repeatsFor(locs.length, routes.length));
    res.start = key === 'prim' ? (start || locs[0]) : null;
    results[key] = res;
    return res;
  }

  function runAlgorithm(key) {
    if (!canRun()) return null;
    const res = execute(key);
    renderResult(key, res);
    highlight(key, res);
    renderComparison();
    return res;
  }

  function renderResult(key, res) {
    const out = $(key + '-out');
    out.innerHTML = '';

    if (!res.connected) {
      const detail = key === 'prim'
        ? 'Only ' + res.reached + ' of ' + res.vertexCount + ' locations can be reached from "' + res.start + '".'
        : 'The network splits into ' + plural(res.components, 'separate group') + '.';
      out.appendChild(el('div', { class: 'alert', text: 'The network is not fully connected, so no minimum spanning tree exists. ' + detail + ' Add routes to link every location. The routes below are only a partial result.' }));
    }

    const stats = el('div', { class: 'stats' }, [
      statBox('Total cost', fmtNum(res.totalCost), key),
      statBox('Routes selected', res.edges.length + ' of ' + Math.max(res.vertexCount - 1, 0), ''),
      statBox('Avg. time', fmtTime(res.timeMs), ''),
      statBox('Edges examined', String(res.edgesExamined), '')
    ]);
    out.appendChild(stats);

    const tbody = el('tbody');
    res.edges.forEach((e, i) => {
      tbody.appendChild(el('tr', null, [
        el('td', { text: String(i + 1) }),
        el('td', { text: e.source }),
        el('td', { text: e.target }),
        el('td', { class: 'num-col', text: fmtNum(e.weight) })
      ]));
    });
    const table = el('table', { class: 'data' }, [
      el('thead', null, [el('tr', null, [
        el('th', { text: '#' }), el('th', { text: 'From' }), el('th', { text: 'To' }), el('th', { class: 'num-col', text: 'Distance' })
      ])]),
      tbody,
      el('tfoot', null, [el('tr', null, [
        el('td', { text: '' }), el('td', { text: 'Total', colspan: '2' }), el('td', { class: 'num-col', text: fmtNum(res.totalCost) })
      ])])
    ]);
    out.appendChild(el('div', { class: 'table-wrap' }, [table]));
    if (key === 'prim') out.appendChild(el('p', { class: 'hint', text: 'Started from "' + res.start + '". Any start gives the same total cost.' }));
  }

  function statBox(label, value, key) {
    return el('div', { class: 'stat-box ' + key }, [el('small', { text: label }), el('strong', { text: value })]);
  }

  function clearResults() {
    results.prim = null;
    results.kruskal = null;
    $('prim-out').innerHTML = '';
    $('kruskal-out').innerHTML = '';
    renderComparison();
    clearHighlight();
  }

  /* ------------------------------------------------------------------ *
   * Comparison
   * ------------------------------------------------------------------ */
  function renderComparison() {
    const out = $('compare-out');
    out.innerHTML = '';
    const p = results.prim, k = results.kruskal;
    if (!p || !k) {
      out.appendChild(el('p', { class: 'empty show', text: 'Run both algorithms to see them side by side.' }));
      return;
    }

    const sameCost = Math.abs(p.totalCost - k.totalCost) < 1e-9;
    const sameEdges = MST.sameEdgeSet(p.edges, k.edges);

    const row = (label, a, b, cls) => el('tr', null, [
      el('td', { text: label }), el('td', { class: 'num-col col-prim', text: a }), el('td', { class: 'num-col col-kruskal', text: b })
    ]);
    const table = el('table', { class: 'data' }, [
      el('thead', null, [el('tr', null, [
        el('th', { text: 'Measure' }),
        el('th', { class: 'num-col col-prim', text: "Prim's" }),
        el('th', { class: 'num-col col-kruskal', text: "Kruskal's" })
      ])]),
      el('tbody', null, [
        row('Total cost', fmtNum(p.totalCost), fmtNum(k.totalCost)),
        row('Routes selected', String(p.edges.length), String(k.edges.length)),
        row('Edges examined', String(p.edgesExamined), String(k.edgesExamined)),
        row('Average time', fmtTime(p.timeMs), fmtTime(k.timeMs))
      ])
    ]);
    out.appendChild(el('div', { class: 'table-wrap' }, [table]));

    const verdict = el('div', { class: 'verdict' });
    const costLine = el('p');
    costLine.appendChild(el('span', { class: 'tag ' + (sameCost ? 'yes' : 'no'), text: sameCost ? 'Same total cost' : 'Different total cost' }));
    costLine.appendChild(document.createTextNode(sameCost
      ? ' Both algorithms found the minimum cost of ' + fmtNum(p.totalCost) + '.'
      : ' The costs differ, which should never happen. Check the input data.'));
    verdict.appendChild(costLine);

    if (sameCost && !sameEdges) {
      verdict.appendChild(el('p', { text: 'The chosen routes differ because some routes have equal distances. Several minimum spanning trees exist and each costs the same.' }));
    }

    const ratio = Math.min(p.timeMs, k.timeMs) / Math.max(p.timeMs, k.timeMs);
    let speed;
    if (ratio > 0.85) speed = "Both ran at about the same speed (Prim's " + fmtTime(p.timeMs) + ", Kruskal's " + fmtTime(k.timeMs) + ').';
    else speed = (p.timeMs < k.timeMs ? "Prim's" : "Kruskal's") + ' ran faster on this network (' + fmtTime(Math.min(p.timeMs, k.timeMs)) + ' against ' + fmtTime(Math.max(p.timeMs, k.timeMs)) + ').';
    verdict.appendChild(el('p', { text: speed + ' On small networks the gap is too small to mean much. Use the benchmark in section 7 for larger ones.' }));
    if (!p.connected || !k.connected) verdict.appendChild(el('p', { class: 'msg warn', text: 'The network is not connected, so these results are partial.' }));
    out.appendChild(verdict);
  }

  function compareBoth() {
    if (!canRun()) return;
    const p = execute('prim');
    const k = execute('kruskal');
    renderResult('prim', p);
    renderResult('kruskal', k);
    highlight('kruskal', k);
    renderComparison();
  }

  /* ------------------------------------------------------------------ *
   * Benchmark on generated networks
   * ------------------------------------------------------------------ */
  async function runBenchmark() {
    const btn = $('btn-bench');
    const body = $('bench-body');
    btn.disabled = true;
    body.innerHTML = '';
    const sizes = [10, 50, 100, 200, 500];
    const densities = ['sparse', 'medium', 'dense'];
    const total = sizes.length * densities.length;
    let done = 0;

    for (const n of sizes) {
      for (const density of densities) {
        setMsg('bench-status', 'Running ' + (done + 1) + ' of ' + total + ': ' + n + ' locations, ' + density + '...', '');
        await new Promise(r => setTimeout(r, 20));        // let the page repaint
        const m = MST.edgeCountFor(n, density);
        const g = MST.generateRandomGraph(n, m, { seed: 2024 + n });
        const reps = MST.repeatsFor(n, g.routes.length);
        const pFn = () => MST.prim(g.locations, g.routes);
        const kFn = () => MST.kruskal(g.locations, g.routes);
        const pRes = pFn(), kRes = kFn();
        const pT = MST.measure(pFn, reps);
        const kT = MST.measure(kFn, reps);
        const same = Math.abs(pRes.totalCost - kRes.totalCost) < 1e-9;
        const ratio = Math.min(pT, kT) / Math.max(pT, kT);
        const faster = ratio > 0.9 ? 'Similar' : (pT < kT ? "Prim's" : "Kruskal's");
        body.appendChild(el('tr', null, [
          el('td', { text: String(n) }),
          el('td', { text: String(g.routes.length) }),
          el('td', { text: density }),
          el('td', { class: 'num-col col-prim', text: pT.toFixed(pT < 1 ? 4 : 2) }),
          el('td', { class: 'num-col col-kruskal', text: kT.toFixed(kT < 1 ? 4 : 2) }),
          el('td', { text: faster }),
          el('td', null, [el('span', { class: 'tag ' + (same ? 'yes' : 'no'), text: same ? 'Yes' : 'No' })])
        ]));
        done++;
      }
    }
    setMsg('bench-status', 'Finished. "Similar" means the two times were within 10% of each other. Results vary slightly between runs and browsers.', 'ok');
    btn.disabled = false;
  }

  /* ------------------------------------------------------------------ *
   * Whole-network changes
   * ------------------------------------------------------------------ */
  function networkChanged() {
    save();
    clearResults();
    renderLocations();
    renderSelects();
    renderRoutes();
    updateGraph();
  }

  function replaceNetwork(locations, routes) {
    state.locations = locations;
    state.routes = routes;
    networkChanged();
  }

  function confirmReplace() {
    return state.locations.length === 0 || confirm('This replaces the current network. Continue?');
  }

  /* ------------------------------------------------------------------ *
   * Wire up events
   * ------------------------------------------------------------------ */
  function bind() {
    $('location-form').addEventListener('submit', ev => {
      ev.preventDefault();
      const input = $('location-input');
      const err = addLocation(input.value);
      if (err) setMsg('location-msg', err, 'error');
      else { setMsg('location-msg', 'Location added.', 'ok'); input.value = ''; }
      input.focus();
    });

    $('route-form').addEventListener('submit', ev => {
      ev.preventDefault();
      const err = addRoute($('route-source').value, $('route-target').value, $('route-weight').value);
      if (err) setMsg('route-msg', err, 'error');
      else { setMsg('route-msg', 'Route added.', 'ok'); $('route-weight').value = ''; $('route-weight').focus(); }
    });

    $('gen-form').addEventListener('submit', ev => {
      ev.preventDefault();
      let n = parseInt($('gen-n').value, 10);
      if (!Number.isFinite(n)) n = 10;
      n = Math.max(2, Math.min(40, n));
      $('gen-n').value = n;
      if (!confirmReplace()) return;
      const g = MST.generateRandomGraph(n, MST.edgeCountFor(n, $('gen-density').value), { seed: Date.now() % 100000, prefix: 'Hub ' });
      replaceNetwork(g.locations, g.routes);
      setMsg('route-msg', 'Generated ' + plural(g.locations.length, 'location') + ' and ' + plural(g.routes.length, 'route') + '.', 'ok');
    });

    $('btn-sample').addEventListener('click', () => {
      if (!confirmReplace()) return;
      replaceNetwork(SAMPLE.locations.slice(), SAMPLE.routes.map(r => Object.assign({}, r)));
      setMsg('route-msg', 'Sample network loaded. Both algorithms should give a total cost of 11.', 'ok');
    });

    $('btn-clear').addEventListener('click', () => {
      if (state.locations.length === 0 && state.routes.length === 0) return;
      if (!confirm('Remove all locations and routes?')) return;
      replaceNetwork([], []);
      setMsg('location-msg', 'Everything cleared.', 'ok');
      setMsg('route-msg', '', '');
    });

    $('btn-layout').addEventListener('click', runLayout);
    $('btn-prim').addEventListener('click', () => runAlgorithm('prim'));
    $('btn-kruskal').addEventListener('click', () => runAlgorithm('kruskal'));
    $('btn-compare').addEventListener('click', compareBoth);
    $('btn-bench').addEventListener('click', runBenchmark);

    // Re-draw cleanly if the window size changes
    window.addEventListener('resize', () => { if (cy) cy.resize(); });
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  function init() {
    load();
    initGraph();
    bind();
    renderLocations();
    renderSelects();
    renderRoutes();
    renderComparison();
    updateGraph();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
