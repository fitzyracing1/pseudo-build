'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const { extractUnits, sourceKindOf, MAX_BYTES } = require('./extract');
const { convertPseudo, convertCodeLift, testFile } = require('./convert');

// Grouped by source kind; crawl slots are shared round-robin across kinds.
const QUERIES = {
  'code-lift': ['path:.pseudo extension:md'],
  'pseudo-file': ['extension:pseudo'],
  markdown: ['"```pseudocode" extension:md', '"ENDWHILE" "ENDIF" extension:md', '"pseudo code" "END IF" extension:md'],
  notebook: ['pseudocode ENDIF extension:ipynb', '"Algorithm:" "Step 1" extension:ipynb'],
  text: ['ENDIF ENDWHILE extension:txt', 'pseudocode extension:rst', 'algorithmic EndFor extension:tex', 'pseudocode extension:org'],
  source: ['pseudocode ENDIF language:python', 'pseudocode "END IF" language:javascript', 'pseudocode ENDWHILE language:c', 'pseudocode ENDIF language:java',
    'pseudocode "END FOR" language:go', 'pseudocode ENDIF language:rust', 'pseudocode ENDIF language:ruby', 'pseudocode ENDIF language:typescript', 'pseudocode ENDIF language:cpp'],
};
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const safe = s => s.replace(/[^\w.-]+/g, '_');

// Search (read-only). Each kind's queries feed a queue; hits are taken round-robin across kinds so
// no single kind can fill every slot. Returns [{owner, repo, path, sha, htmlUrl, sourceKind, query}].
async function search(client, { limit = 20, queries = QUERIES, log = () => {}, perQuery } = {}) {
  if (Array.isArray(queries)) queries = { any: queries };
  const kinds = Object.keys(queries); const share = Math.ceil(limit / kinds.length);
  const per = perQuery || Math.min(30, Math.max(5, share + 3));
  const queues = {}; const seen = new Set();
  for (const k of kinds) {
    queues[k] = [];
    for (const q of queries[k]) {
      if (queues[k].length >= share + 5) break;          // enough candidates for this kind
      let r; try { r = await client.get('search/code', { fields: { q, per_page: per } }); } catch (e) { log(`search failed [${k}] ${q}: ${e.message}`); continue; }
      let n = 0;
      for (const it of r.items || []) {
        const sk = sourceKindOf(it.path); if (!sk) continue;
        const owner = it.repository.owner.login, repo = it.repository.name, key = `${owner}/${repo}/${it.path}`;
        if (it.repository.private || seen.has(key)) continue; seen.add(key);
        queues[k].push({ owner, repo, path: it.path, sha: it.sha, url: it.url, htmlUrl: it.html_url, sourceKind: sk, slot: k, query: q }); n++;
      }
      log(`[${k}] ${JSON.stringify(q)}: ${n} usable of ${(r.items || []).length} (total ${r.total_count})`);
    }
  }
  const hits = []; let progress = true;
  while (hits.length < limit && progress) { progress = false; for (const k of kinds) if (hits.length < limit && queues[k].length) { hits.push(queues[k].shift()); progress = true; } }
  return hits;
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
  hit.sourceKind ||= sourceKindOf(hit.path);
  const rawDir = path.join(outRoot, safe(hit.owner), safe(hit.repo), '_raw'); fs.mkdirSync(rawDir, { recursive: true }); fs.writeFileSync(path.join(rawDir, safe(hit.path)), text);
  for (const u of extractUnits(hit.path, text)) {
    const dir = path.join(outRoot, safe(hit.owner), safe(hit.repo), safe(hit.path) + (u.kind === hit.sourceKind || u.kind === 'code-lift' || u.kind === 'pseudo-file' ? '' : `.unit${u.index + 1}`));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'source.pseudo'), u.text);
    const base = { owner: hit.owner, repo: hit.repo, path: hit.path, unit: u.index, kind: u.kind, sourceKind: u.sourceKind, tagged: !!u.tagged, cell: u.cell, startLine: u.startLine,
      sourceUrl: (hit.htmlUrl || `https://github.com/${hit.owner}/${hit.repo}/blob/HEAD/${hit.path}`) + (u.startLine > 1 && u.cell === undefined ? `#L${u.startLine}` : ''),
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
  const results = [], skipped = [], noUnits = [];
  for (const h of hits) {
    let text; try { text = await fetchHit(client, h); } catch (e) { log(`fetch failed ${h.owner}/${h.repo}/${h.path}: ${e.message}`); continue; }
    if (typeof text !== 'string') text = JSON.stringify(text);
    if (text.length > MAX_BYTES) { log(`skip (too large) ${h.owner}/${h.repo}/${h.path}`); skipped.push({ ...h, reason: 'too large' }); continue; }
    if (/\u0000/.test(text.slice(0, 8000))) { skipped.push({ ...h, reason: 'binary' }); continue; }
    const r = processFile(outRoot, h, text);
    log(`${h.owner}/${h.repo}/${h.path}: ${r.map(x => x.status).join(',') || 'no pseudocode units'}`);
    if (!r.length) noUnits.push({ owner: h.owner, repo: h.repo, path: h.path, sourceKind: h.sourceKind });
    r.forEach(x => x.slot = h.slot);
    results.push(...r);
  }
  const by = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] ||= { lit: 0, dark: 0 }; m[k][x.status]++; return m; }, {});
  const summary = { hits: hits.length, hitsBySourceKind: hits.reduce((m, h) => (m[h.sourceKind] = (m[h.sourceKind] || 0) + 1, m), {}), filesWithoutPseudocode: noUnits.length, skipped: skipped.length, bySourceKind: by(results, r => r.sourceKind), byUnitKind: by(results, r => r.kind), units: results.length, lit: results.filter(r => r.status === 'lit').length, dark: results.filter(r => r.status === 'dark').length };
  const doc = { generatedAt: new Date().toISOString(), summary, results, noUnits, skipped };
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
    const rawF = path.join(outRoot, safe(r.owner), safe(r.repo), '_raw', safe(r.path));
    const text = fs.existsSync(rawF) ? fs.readFileSync(rawF, 'utf8') : r.kind === 'md-block' ? units.map(u => '```pseudo\n' + fs.readFileSync(path.join(outRoot, u.outDir, 'source.pseudo'), 'utf8') + '\n```').join('\n\n') : fs.readFileSync(path.join(outRoot, r.outDir, 'source.pseudo'), 'utf8');
    results.push(...processFile(outRoot, hit, text));
  }
  const summary = { ...prev.summary, units: results.length, lit: results.filter(r => r.status === 'lit').length, dark: results.filter(r => r.status === 'dark').length };
  const doc = { generatedAt: new Date().toISOString(), crawledAt: prev.crawledAt || prev.generatedAt, summary, results };
  fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify(doc, null, 2)); return doc;
}
module.exports = { rebuild, crawl, search, processFile, runTests, QUERIES, sha };
