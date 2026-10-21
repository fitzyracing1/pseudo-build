'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const { extractUnits, kindOf } = require('./extract');
const { convertPseudo, convertCodeLift, testFile } = require('./convert');

const QUERIES = [
  'path:.pseudo extension:md',               // code-lift output
  'extension:pseudo',                        // *.pseudo files
  '"```pseudocode" extension:md',            // fenced pseudocode blocks
  '"```pseudo" extension:md',
];
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const safe = s => s.replace(/[^\w.-]+/g, '_');

// Search (read-only). Returns unique hits [{owner, repo, path, sha, url, htmlUrl}] up to limit.
async function search(client, { limit = 20, queries = QUERIES, log = () => {} } = {}) {
  const hits = new Map();
  for (const q of queries) {
    if (hits.size >= limit) break;
    const per = Math.min(limit, 30);
    let r; try { r = await client.get('search/code', { fields: { q, per_page: per } }); } catch (e) { log(`search failed for ${q}: ${e.message}`); continue; }
    for (const it of r.items || []) {
      if (hits.size >= limit) break;
      if (!kindOf(it.path)) continue;
      const owner = it.repository.owner.login, repo = it.repository.name;
      if (it.repository.private || it.repository.fork === undefined && false) continue;
      const key = `${owner}/${repo}/${it.path}`;
      if (!hits.has(key)) hits.set(key, { owner, repo, path: it.path, sha: it.sha, url: it.url, htmlUrl: it.html_url, query: q });
    }
    log(`query ${JSON.stringify(q)}: ${(r.items || []).length} items (total ${r.total_count})`);
  }
  return [...hits.values()];
}

async function fetchHit(client, hit) {
  return client.get(`repos/${hit.owner}/${hit.repo}/contents/${hit.path.split('/').map(encodeURIComponent).join('/')}`, { accept: 'application/vnd.github.raw+json', fields: hit.sha ? {} : {} });
}

function runTests(dir, timeoutMs = 15000) {
  const r = spawnSync(process.execPath, ['--experimental-permission', `--allow-fs-read=${dir}`, `--allow-fs-read=${process.execPath}`, '--test-reporter=tap', 'test.js'], { cwd: dir, timeout: timeoutMs, encoding: 'utf8', env: { PATH: process.env.PATH } });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  const errLine = (out.match(/^\s+(?:error:|AssertionError|Error|ReferenceError|TypeError|SyntaxError).*$/m) || [''])[0].trim();
  return { ok: r.status === 0, timedOut: r.error && r.error.code === 'ETIMEDOUT', output: out.slice(-3000), fails, errLine,
    pass: +(out.match(/^# pass (\d+)/m) || [0, 0])[1], fail: +(out.match(/^# fail (\d+)/m) || [0, 0])[1] };
}

// Convert + test one fetched file. Writes to outRoot/<owner>/<repo>/<path>[#n]/.
function processFile(outRoot, hit, text) {
  const results = [];
  for (const u of extractUnits(hit.path, text)) {
    const dir = path.join(outRoot, safe(hit.owner), safe(hit.repo), safe(hit.path) + (u.kind === 'md-block' ? `.block${u.index + 1}` : ''));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'source.pseudo'), u.text);
    const base = { owner: hit.owner, repo: hit.repo, path: hit.path, unit: u.index, kind: u.kind, startLine: u.startLine,
      sourceUrl: (hit.htmlUrl || `https://github.com/${hit.owner}/${hit.repo}/blob/HEAD/${hit.path}`) + (u.kind === 'md-block' ? `#L${u.startLine}` : ''),
      hash: sha(u.text), outDir: path.relative(outRoot, dir), excerpt: u.text.split('\n').slice(0, 15).join('\n') };
    let conv;
    try { conv = u.kind === 'code-lift' ? convertCodeLift(u.text) : convertPseudo(u.text); }
    catch (e) {
      if (e.generated) fs.writeFileSync(path.join(dir, 'index.js'), e.generated);
      results.push({ ...base, status: 'dark', stage: 'convert', error: e.message, errorLine: e.line ? u.startLine + e.line - 1 : null, errorSource: e.source, generated: e.generated || null });
      continue;
    }
    fs.writeFileSync(path.join(dir, 'index.js'), conv.code);
    fs.writeFileSync(path.join(dir, 'test.js'), testFile(conv));
    const t = runTests(dir);
    results.push({ ...base, status: t.ok ? 'lit' : 'dark', stage: 'test', functions: conv.functions, examples: conv.tests.length, tests: { pass: t.pass, fail: t.fail },
      error: t.ok ? null : (t.timedOut ? 'Tests timed out (possible infinite loop)' : [t.fails.join('; '), t.errLine].filter(Boolean).join(' — ') || 'tests failed'),
      generated: conv.code, testOutput: t.ok ? undefined : t.output });
  }
  return results;
}

async function crawl(client, { outRoot, limit = 20, log = () => {}, queries } = {}) {
  const hits = await search(client, { limit, log, queries });
  const results = [];
  for (const h of hits) {
    let text; try { text = await fetchHit(client, h); } catch (e) { log(`fetch failed ${h.owner}/${h.repo}/${h.path}: ${e.message}`); continue; }
    if (typeof text !== 'string') text = JSON.stringify(text);
    const r = processFile(outRoot, h, text);
    log(`${h.owner}/${h.repo}/${h.path}: ${r.map(x => x.status).join(',') || 'no pseudocode units'}`);
    results.push(...r);
  }
  const summary = { hits: hits.length, units: results.length, lit: results.filter(r => r.status === 'lit').length, dark: results.filter(r => r.status === 'dark').length };
  const doc = { generatedAt: new Date().toISOString(), summary, results };
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify(doc, null, 2));
  return doc;
}
function rebuild(outRoot) {
  const prev = JSON.parse(fs.readFileSync(path.join(outRoot, 'results.json'), 'utf8'));
  const files = new Map(); for (const r of prev.results) files.set(`${r.owner}/${r.repo}/${r.path}`, r);
  const results = [];
  for (const r of files.values()) {
    const hit = { owner: r.owner, repo: r.repo, path: r.path, htmlUrl: r.sourceUrl.replace(/#.*$/, '') };
    const units = prev.results.filter(x => x.owner === r.owner && x.repo === r.repo && x.path === r.path);
    const text = r.kind === 'md-block' ? units.map(u => '```pseudo\n' + fs.readFileSync(path.join(outRoot, u.outDir, 'source.pseudo'), 'utf8') + '\n```').join('\n\n') : fs.readFileSync(path.join(outRoot, r.outDir, 'source.pseudo'), 'utf8');
    results.push(...processFile(outRoot, hit, text));
  }
  const summary = { ...prev.summary, units: results.length, lit: results.filter(r => r.status === 'lit').length, dark: results.filter(r => r.status === 'dark').length };
  const doc = { generatedAt: new Date().toISOString(), crawledAt: prev.crawledAt || prev.generatedAt, summary, results };
  fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify(doc, null, 2)); return doc;
}
module.exports = { rebuild, crawl, search, processFile, runTests, QUERIES, sha };
