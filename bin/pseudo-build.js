#!/usr/bin/env node
'use strict';
const path = require('path'), fs = require('fs');
const { ghClient } = require('../lib/github');
const { crawl, rebuild } = require('../lib/crawl');
const { planIssues, fileIssues, ALLOWED_REPO } = require('../lib/issues');
const { buildBoard } = require('../lib/board');
const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); flags[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; }
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(flags.out || path.join(ROOT, 'out'));
const log = m => console.error('  ' + m);
(async () => {
  switch (cmd) {
    case 'crawl': {
      const doc = await crawl(ghClient(), { outRoot: OUT, limit: Math.min(+flags.limit || 20, 100), log });
      console.log(`crawl: ${doc.summary.hits} hits, ${doc.summary.units} pseudocode units -> lit ${doc.summary.lit}, dark ${doc.summary.dark}\n  results: ${path.join(OUT, 'results.json')}`); break;
    }
    case 'rebuild': { const doc = rebuild(OUT); console.log(`rebuild (offline, cached sources): ${doc.summary.units} units -> lit ${doc.summary.lit}, dark ${doc.summary.dark}`); break; }
    case 'issues': {
      const results = JSON.parse(fs.readFileSync(path.join(OUT, 'results.json'), 'utf8')).results;
      const plan = planIssues(results, OUT);
      const dryRun = !flags.file;  // dry-run unless --file is given explicitly
      const actions = await fileIssues(dryRun ? null : ghClient({ minIntervalMs: 1000 }), plan, { repo: flags.repo || ALLOWED_REPO, dryRun, log });
      if (!dryRun) { const doc = plan.doc; for (const a of actions) { const i = doc.issues.find(x => x.key === a.key); if (i && a.url) i.issueUrl = a.url; } fs.writeFileSync(path.join(OUT, 'issues.json'), JSON.stringify(doc, null, 2)); }
      console.log(`issues${dryRun ? ' [dry-run]' : ''}: ${plan.issues.length} dark -> ${path.join(OUT, 'issues')}/*.md + issues.json; actions: ${JSON.stringify(actions.reduce((m, a) => (m[a.op] = (m[a.op] || 0) + 1, m), {}))}`); break;
    }
    case 'board': {
      const doc = JSON.parse(fs.readFileSync(path.join(OUT, 'issues.json'), 'utf8'));
      console.log('board: ' + buildBoard(doc, path.resolve(flags.board || path.join(ROOT, 'board/index.html')))); break;
    }
    default: console.log(`pseudo-build crawl [--limit 20] [--out out]   search GitHub (read-only), fetch, convert, test -> out/results.json
pseudo-build rebuild                                re-convert + re-test cached sources offline
pseudo-build issues [--dry-run] [--file --repo ${ALLOWED_REPO}]   one issue per dark result (dry-run default)
pseudo-build board                                  board/index.html from out/issues.json`);
  }
})().catch(e => { console.error('pseudo-build: ' + e.message); process.exitCode = 1; });
