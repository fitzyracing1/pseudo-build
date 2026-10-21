'use strict';
// One issue per DARK result. Filed ONLY in the owner's own repo; never on crawled repos.
const fs = require('fs'), path = require('path');
const ALLOWED_REPO = 'fitzyracing1/pseudo-build';
const marker = key => `<!-- pseudo-build:key=${key} -->`;
const keyOf = r => require('crypto').createHash('sha256').update(r.sourceUrl.replace(/#.*$/, '') + '#' + r.unit + '|' + r.hash).digest('hex').slice(0, 20);
const srcKey = r => r.sourceUrl.replace(/#.*$/, '') + '#' + r.unit;   // same source, any content version
const fence = (s, lang = '') => '```' + lang + '\n' + String(s || '').replace(/```/g, '`\u200b``') + '\n```';

function howToFix(r) {
  const e = r.error || '';
  const tips = [];
  if (r.stage === 'convert') {
    if (/Unrecognized/.test(e)) tips.push(`Line ${r.errorLine || '?'} uses a statement the converter does not understand. Rewrite it with one of the supported keywords (FUNCTION, IF/ELSE/END IF, FOR EACH x IN list, FOR i FROM a TO b, WHILE, REPEAT/UNTIL, SET x TO value, RETURN, PRINT, APPEND x TO list, CALL f(x)).`);
    if (/without/.test(e)) tips.push('A block is closed or continued without being opened. Check that every END / ELSE / UNTIL has a matching IF, loop, REPEAT or FUNCTION above it.');
    if (/compile/.test(e)) tips.push('The pseudocode converted, but the result is not valid JavaScript. The usual cause is an expression the translator copied as-is (for example math symbols or natural-language phrases). Write the expression in plain operators like +, -, *, /, <, >, AND, OR, NOT.');
    if (/No convertible|no symbols/.test(e)) tips.push('No functions or statements were found. Make sure the block actually contains pseudocode, or wrap the algorithm in FUNCTION name(params) ... END FUNCTION.');
    tips.push('If the pseudocode is fine and the converter is wrong, improve lib/convert.js in pseudo-build and add this case to the test fixtures.');
  } else {
    if (/timed out/.test(e)) tips.push('The generated code never finished. Look for a loop whose condition never changes, or a recursive call with no base case.');
    if (/is not defined|ReferenceError/.test(e)) tips.push('The code refers to something that is never defined. Define the helper in the pseudocode, or treat it as an external dependency the converter should stub.');
    if (/Expected|deepStrictEqual|AssertionError/.test(e)) tips.push('An EXAMPLE/ASSERT line in the pseudocode does not match what the algorithm returns. Either the example is wrong or the algorithm has a bug: trace it by hand with that input.');
    tips.push('Run it locally: open the generated folder and run `node --test test.js`.');
  }
  return tips.map(t => `- ${t}`).join('\n');
}

function renderIssue(r) {
  const key = keyOf(r);
  const title = `[dark] ${r.owner}/${r.repo}: ${r.path}${r.kind === 'md-block' ? ` (block ${r.unit + 1})` : ''}, ${r.stage === 'convert' ? 'could not convert' : 'tests fail'}`;
  const what = r.stage === 'convert'
    ? `The pseudocode in \`${r.path}\` from ${r.owner}/${r.repo} could not be turned into working code. The converter stopped${r.errorLine ? ` at line ${r.errorLine}` : ''} because: ${r.error}`
    : `The pseudocode in \`${r.path}\` from ${r.owner}/${r.repo} converted into JavaScript, but the generated tests did not pass. ${r.tests && r.tests.pass + r.tests.fail ? `${r.tests.fail} of ${r.tests.pass + r.tests.fail} tests failed.` : 'The generated module crashed while loading, so no test could run.'}`;
  const body = [marker(key), '',
    `## What's broken`, '', what, '', 'This result is **dark**. It will be closed automatically as soon as the same source converts and passes (turns **lit**).', '',
    `## The pseudocode`, '', `Source: ${r.sourceUrl}`, '', 'Excerpt (first lines):', '', fence(r.excerpt, 'pseudo'), '',
    `## What was generated`, '', r.generated ? fence(r.generated.split('\n').slice(0, 40).join('\n'), 'js') : 'Nothing was generated, because conversion stopped before any code was produced.', '',
    `## The error`, '', fence([...new Set([r.error, ...(r.testOutput ? r.testOutput.split('\n').filter(l => /not ok|expected|actual|Error:/i.test(l)).map(l => l.trim()).slice(0, 12) : [])])].join('\n') + (r.errorSource ? `\n  at pseudo line: ${r.errorSource.trim()}` : '')), '',
    `## How to fix`, '', howToFix(r), '',
    `## Details`, '', '| Field | Value |', '|---|---|',
    `| Status | dark |`, `| Stage | ${r.stage} |`, `| Kind | ${r.kind} |`, `| Repository | [${r.owner}/${r.repo}](https://github.com/${r.owner}/${r.repo}) |`,
    `| File | \`${r.path}\` |`, `| Unit | ${r.unit} (starts at line ${r.startLine}) |`, `| Content hash | \`${r.hash}\` |`, `| Dedupe key | \`${key}\` |`,
    `| Local output | \`out/${r.outDir}\` |`, '', '_Filed by pseudo-build in its own tracker. Nothing was posted to the source repository._'].join('\n');
  return { key, srcKey: srcKey(r), title, body, labels: ['dark', `stage:${r.stage}`, `kind:${r.kind}`], result: r };
}

// Writes out/issues/*.md + issues.json; returns plan {open:[...], close:[...]}.
function planIssues(results, outRoot) {
  const dark = results.filter(r => r.status === 'dark').map(renderIssue);
  const seen = new Set(); const issues = dark.filter(i => !seen.has(i.key) && seen.add(i.key));
  const litSrc = results.filter(r => r.status === 'lit').map(r => ({ srcKey: srcKey(r), sourceUrl: r.sourceUrl, hash: r.hash }));
  const dir = path.join(outRoot, 'issues'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const i of issues) fs.writeFileSync(path.join(dir, `${i.key}.md`), `# ${i.title}\n\n${i.body}\n`);
  const doc = { generatedAt: new Date().toISOString(), counts: { lit: results.length - dark.length, dark: issues.length },
    issues: issues.map(i => ({ key: i.key, srcKey: i.srcKey, title: i.title, labels: i.labels, file: `issues/${i.key}.md`, owner: i.result.owner, repo: i.result.repo, path: i.result.path,
      sourceUrl: i.result.sourceUrl, stage: i.result.stage, kind: i.result.kind, error: i.result.error, hash: i.result.hash, issueUrl: null })),
    lit: litSrc };
  fs.writeFileSync(path.join(outRoot, 'issues.json'), JSON.stringify(doc, null, 2));
  return { doc, issues };
}

// Real filing (only when not dry-run). client.write/get go to GitHub; tests pass a mock.
async function fileIssues(client, plan, { repo, dryRun = true, log = () => {} }) {
  if (repo !== ALLOWED_REPO) throw new Error(`Refusing to file issues in ${repo}: only ${ALLOWED_REPO} is allowed.`);
  const actions = [];
  const existing = dryRun ? [] : await client.get(`repos/${repo}/issues`, { fields: { state: 'all', labels: 'dark', per_page: 100 } });
  const byKey = new Map();
  for (const ex of existing) { const k = (ex.body || '').match(/pseudo-build:key=(\w+)/); if (k) byKey.set(k[1], ex); }
  for (const i of plan.issues) {
    const ex = byKey.get(i.key);
    if (!ex) actions.push({ op: 'create', key: i.key, title: i.title });
    else if (ex.state === 'closed') actions.push({ op: 'reopen+update', number: ex.number, key: i.key });
    else if (ex.title !== i.title || ex.body !== i.body) actions.push({ op: 'update', number: ex.number, key: i.key });
    else actions.push({ op: 'noop', number: ex.number, key: i.key });
  }
  // close open issues whose source is now lit, or whose key is no longer dark (content changed + fixed)
  const darkKeys = new Set(plan.issues.map(i => i.key));
  const litSrc = new Set(plan.doc.lit.map(l => l.srcKey));
  for (const ex of existing) {
    const k = ((ex.body || '').match(/pseudo-build:key=(\w+)/) || [])[1]; if (!k || ex.state !== 'open' || darkKeys.has(k)) continue;
    const src = (ex.body.match(/^Source: (\S+)/m) || [])[1]; const unit = (ex.body.match(/\| Unit \| (\d+)/) || [])[1];
    const sk = src && src.replace(/#.*$/, '') + '#' + unit;
    if (litSrc.has(sk)) actions.push({ op: 'close', number: ex.number, key: k, reason: 'now lit' });
  }
  if (dryRun) { log(`[dry-run] ${actions.length} planned issue actions in ${repo}`); return actions; }
  for (const a of actions) {
    const i = plan.issues.find(x => x.key === a.key);
    if (a.op === 'create') { const r = await client.write('POST', `repos/${repo}/issues`, { title: i.title, body: i.body, labels: i.labels }); a.url = r.html_url; a.number = r.number; }
    else if (a.op === 'update' || a.op === 'reopen+update') await client.write('PATCH', `repos/${repo}/issues/${a.number}`, { title: i.title, body: i.body, state: 'open' });
    else if (a.op === 'close') { await client.write('POST', `repos/${repo}/issues/${a.number}/comments`, { body: 'This source is now **lit** (converted and tests pass). Closing.' }); await client.write('PATCH', `repos/${repo}/issues/${a.number}`, { state: 'closed', state_reason: 'completed' }); }
  }
  return actions;
}
module.exports = { renderIssue, planIssues, fileIssues, keyOf, ALLOWED_REPO };
