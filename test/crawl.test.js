const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { crawl } = require('../lib/crawl');
const { mockClient } = require('./mock');
test('offline crawl: search, fetch, convert, run tests, lit/dark results.json', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-')); const c = mockClient();
  const doc = await crawl(c, { outRoot: out, limit: 20, queries: ['q'] });
  assert.equal(doc.summary.hits, 3, 'non-pseudo hit (src/app.js) ignored');
  const by = Object.fromEntries(doc.results.map(r => [`${r.repo}:${r.unit}`, r]));
  assert.equal(by['algos:0'].status, 'lit'); assert.equal(by['shop:0'].status, 'lit');
  assert.equal(by['notes:0'].status, 'lit'); assert.equal(by['notes:1'].status, 'dark'); assert.equal(by['notes:1'].stage, 'test');
  assert.equal(by['notes:2'].status, 'dark'); assert.equal(by['notes:2'].stage, 'convert');
  assert.ok(fs.existsSync(path.join(out, 'alice/algos/algos_fib.pseudo/index.js')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'results.json'))).summary, doc.summary);
  assert.ok(c.calls.every(([m]) => m === 'GET'), 'crawl is read-only');
});
