const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { crawl, search } = require('../lib/crawl');
const { mockClient } = require('./mock');
test('offline crawl: search, fetch, convert, run tests, lit/dark results.json', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-')); const c = mockClient();
  const doc = await crawl(c, { outRoot: out, limit: 20, queries: ['q'] });
  assert.equal(doc.summary.hits, 4); assert.equal(doc.summary.filesWithoutPseudocode, 1, 'plain src/app.js has no pseudocode');
  assert.ok(doc.results.every(r => r.sourceKind));
  const by = Object.fromEntries(doc.results.map(r => [`${r.repo}:${r.unit}`, r]));
  assert.equal(by['algos:0'].status, 'lit'); assert.equal(by['shop:0'].status, 'lit');
  assert.equal(by['notes:0'].status, 'lit'); assert.equal(by['notes:1'].status, 'dark'); assert.equal(by['notes:1'].stage, 'test');
  assert.equal(by['notes:2'].status, 'dark'); assert.equal(by['notes:2'].stage, 'convert');
  assert.ok(fs.existsSync(path.join(out, 'alice/algos/algos_fib.pseudo/index.js')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'results.json'))).summary, doc.summary);
  assert.ok(c.calls.every(([m]) => m === 'GET'), 'crawl is read-only');
});
test('round-robin: one kind cannot take every slot; kind recorded on results', async () => {
  const mk = (n, ext, owner) => Array.from({ length: n }, (_, i) => ({ path: `f${i}.${ext}`, sha: 's', html_url: `https://github.com/${owner}/r/blob/main/f${i}.${ext}`, repository: { name: 'r', owner: { login: owner }, private: false } }));
  const client = { calls: [], async get(route, o) { this.calls.push(o.fields.q); const q = o.fields.q; return { total_count: 99, items: q === 'P' ? mk(30, 'pseudo', 'p') : q === 'M' ? mk(30, 'md', 'm') : mk(30, 'py', 's') }; } };
  const hits = await search(client, { limit: 9, queries: { 'pseudo-file': ['P'], markdown: ['M'], source: ['S'] } });
  const count = hits.reduce((m, h) => (m[h.sourceKind] = (m[h.sourceKind] || 0) + 1, m), {});
  assert.deepEqual(count, { 'pseudo-file': 3, markdown: 3, source: 3 });
  // a kind with no hits donates its slots to the others
  const c2 = { async get(r, o) { return { items: o.fields.q === 'P' ? mk(30, 'pseudo', 'p') : [] }; } };
  assert.equal((await search(c2, { limit: 6, queries: { 'pseudo-file': ['P'], markdown: ['M'] } })).length, 6);
});
