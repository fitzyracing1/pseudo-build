const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractUnits, sourceKindOf, pseudoScore } = require('../lib/extract');
const { convertPseudo } = require('../lib/convert');
const K = p => fs.readFileSync(path.join(__dirname, 'fixtures/kinds', p), 'utf8');
const load = code => { const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports); return m.exports; };
const run = (u, fn, ...a) => load(convertPseudo(u.text).code)[fn](...a);

test('source kinds by extension', () => {
  const k = { 'a/.pseudo/x.js.md': 'code-lift', 'x.pseudo': 'pseudo-file', 'R.md': 'markdown', 'n.ipynb': 'notebook', 'a.txt': 'text', 'a.rst': 'text', 'a.tex': 'text', 'a.org': 'text',
    'a.py': 'source', 'a.js': 'source', 'a.ts': 'source', 'a.java': 'source', 'a.c': 'source', 'a.cpp': 'source', 'a.go': 'source', 'a.rs': 'source', 'a.rb': 'source', 'logo.png': null, 'a.zip': null };
  for (const [p, v] of Object.entries(k)) assert.equal(sourceKindOf(p), v, p);
});
test('markdown: indented + untagged fenced pseudocode, ignores real code fences', () => {
  const u = extractUnits('notes.md', K('notes.md'));
  assert.deepEqual(u.map(x => x.kind), ['md-indented', 'md-block']);
  assert.equal(run(u[0], 'double', 4), 8); assert.equal(run(u[1], 'isEven', 4), true);
});
test('notebook: markdown cells only, records cell index', () => {
  const u = extractUnits('search.ipynb', K('search.ipynb'));
  assert.equal(u.length, 1); assert.equal(u[0].kind, 'notebook-cell'); assert.equal(u[0].cell, 0); assert.equal(run(u[0], 'find', [5, 7, 9], 9), 2);
});
test('python docstring pseudocode; plain comments/docstrings ignored', () => {
  const u = extractUnits('algo.py', K('algo.py'));
  assert.equal(u.length, 1); assert.equal(u[0].kind, 'docstring'); assert.equal(run(u[0], 'gcd', 48, 18), 6);
});
test('C block comment pseudocode; stray // lines ignored', () => {
  const u = extractUnits('sum.c', K('sum.c'));
  assert.equal(u.length, 1); assert.equal(u[0].kind, 'source-comment'); assert.equal(run(u[0], 'sumTo', 4), 10);
});
test('plain JS without pseudocode yields nothing', () => assert.equal(extractUnits('app.js', K('app.js')).length, 0));
test('LaTeX algorithmic -> pseudo -> code', () => {
  const u = extractUnits('algo.tex', K('algo.tex'));
  assert.equal(u[0].kind, 'tex-algorithm'); assert.match(u[0].text, /FUNCTION Fact\(n\)/); assert.equal(run(u[0], 'Fact', 5), 120);
});
test('plain text section, prose paragraphs excluded', () => {
  const u = extractUnits('steps.txt', K('steps.txt'));
  assert.equal(u.length, 1); assert.equal(u[0].kind, 'text-section'); assert.ok(!/Homework|Thanks/.test(u[0].text)); assert.deepEqual(run(u[0], 'countDown', 3), [3, 2, 1]);
});
test('rst code-block:: pseudo kept, literal python block ignored', () => {
  const u = extractUnits('guide.rst', K('guide.rst')); assert.deepEqual(u.map(x => x.kind), ['rst-block']); assert.equal(run(u[0], 'sq', 5), 25);
});
test('org #+BEGIN_SRC pseudocode', () => { const u = extractUnits('plan.org', K('plan.org')); assert.equal(u[0].kind, 'org-block'); assert.equal(run(u[0], 'inc', 1), 2); });
test('skips binaries and oversized files', () => {
  assert.equal(extractUnits('a.txt', 'IF x THEN\u0000\nEND IF\nRETURN 1').length, 0);
  assert.equal(extractUnits('a.txt', 'FUNCTION f()\n  RETURN 1\nEND FUNCTION\n'.repeat(20000)).length, 0);
});
test('pseudoScore separates pseudocode from code and prose', () => {
  assert.ok(pseudoScore('IF a THEN\n  RETURN b\nEND IF') > 0.6);
  assert.ok(pseudoScore('const x = 1;\nfunction f() {\n  return x;\n}') < 0.35);
  assert.ok(pseudoScore('This is a sentence.\nAnother sentence here.') < 0.1);
});
