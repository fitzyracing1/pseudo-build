const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { crawl } = require('../lib/crawl');
const { planIssues, fileIssues } = require('../lib/issues');
const { buildBoard } = require('../lib/board');
const { mockClient } = require('./mock');
const setup = async () => { const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-')); const doc = await crawl(mockClient(), { outRoot: out, queries: ['q'] }); return { out, results: doc.results }; };
test('dry-run writes one plain-language issue per dark result + issues.json', async () => {
  const { out, results } = await setup(); const plan = planIssues(results, out);
  assert.equal(plan.issues.length, 2); assert.equal(fs.readdirSync(path.join(out, 'issues')).length, 2);
  for (const i of plan.issues) for (const h of ["## What's broken", '## The pseudocode', 'Source: https://github.com/bob/notes', '## What was generated', '## The error', '## How to fix', '## Details', '| Dedupe key |']) assert.ok(i.body.includes(h), h);
  const j = JSON.parse(fs.readFileSync(path.join(out, 'issues.json'))); assert.equal(j.counts.dark, 2); assert.equal(j.counts.lit, 3);
  const c = mockClient(); const acts = await fileIssues(c, plan, { repo: 'fitzyracing1/pseudo-build', dryRun: true });
  assert.deepEqual(acts.map(a => a.op), ['create', 'create']); assert.equal(c.calls.length, 0, 'dry-run makes no API calls');
});
test('refuses any repo other than fitzyracing1/pseudo-build', async () => {
  const { out, results } = await setup(); const plan = planIssues(results, out);
  for (const repo of ['bob/notes', 'alice/algos', 'fitzyracing1/other']) await assert.rejects(fileIssues(mockClient(), plan, { repo, dryRun: false }), /Refusing/);
});
test('mocked filing: create, dedupe on rerun, close when lit', async () => {
  const { out, results } = await setup(); const c = mockClient(); const repo = 'fitzyracing1/pseudo-build';
  let a = await fileIssues(c, planIssues(results, out), { repo, dryRun: false }); assert.deepEqual(a.map(x => x.op), ['create', 'create']);
  assert.ok(c.calls.filter(x => x[0] !== 'GET').every(x => x[1].startsWith('repos/fitzyracing1/pseudo-build/')));
  a = await fileIssues(c, planIssues(results, out), { repo, dryRun: false }); assert.deepEqual(a.map(x => x.op), ['noop', 'noop']); assert.equal(c.issues.length, 2);
  // the wrong example gets fixed upstream -> same source now lit (new hash)
  const fixed = results.map(r => r.repo === 'notes' && r.unit === 1 ? { ...r, status: 'lit', hash: 'newhash' } : r);
  a = await fileIssues(c, planIssues(fixed, out), { repo, dryRun: false });
  assert.deepEqual(a.map(x => x.op).sort(), ['close', 'noop']); assert.equal(c.issues.filter(i => i.state === 'closed').length, 1);
});
test('board page lists dark items with counts and filters', async () => {
  const { out, results } = await setup(); const plan = planIssues(results, out);
  const f = buildBoard(plan.doc, path.join(out, 'board/index.html')); const h = fs.readFileSync(f, 'utf8');
  for (const s of ['id="stage"', 'id="kind"', 'id="source"', 'id="owner"', 'id="nl"', 'id="nd"', 'bob/notes', '"dark":2']) assert.ok(h.includes(s), s);
});
