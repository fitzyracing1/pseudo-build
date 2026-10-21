const test = require('node:test'), assert = require('node:assert');
const { convertPseudo, convertCodeLift } = require('../lib/convert');
const { extractUnits } = require('../lib/extract');
const { F } = require('./mock');
const load = code => { const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports); return m.exports; };
test('converts .pseudo file to runnable JS', () => { const r = convertPseudo(F('fib.pseudo')); assert.equal(load(r.code).fib(10), 55); assert.equal(r.tests.length, 2); });
test('extracts ```pseudo and ```pseudocode blocks from markdown', () => { const u = extractUnits('README.md', F('README.md')); assert.equal(u.length, 3); assert.match(u[0].text, /bubbleSort/); });
test('bubble sort with SWAP and length of', () => { const u = extractUnits('README.md', F('README.md')); assert.deepEqual(load(convertPseudo(u[0].text).code).bubbleSort([5, 3, 4, 1]), [1, 3, 4, 5]); });
test('REPEAT/UNTIL, WHILE, ELSE IF, APPEND', () => {
  const r = load(convertPseudo(`FUNCTION f(n)\n  SET out TO []\n  REPEAT\n    IF n MOD 15 = 0 THEN\n      APPEND "fb" TO out\n    ELSE IF n MOD 3 = 0 THEN\n      APPEND "f" TO out\n    ELSE\n      APPEND n TO out\n    END IF\n    DECREMENT n\n  UNTIL n = 0\n  RETURN out\nEND FUNCTION`).code);
  assert.deepEqual(r.f(3), ['f', 2, 1]);
});
test('indentation-closed blocks (python-ish)', () => { const r = load(convertPseudo('def sq(x):\n    return x * x\n').code); assert.equal(r.sq(4), 16); });
test('unrecognized statement reports the pseudo line', () => { assert.throws(() => convertPseudo('FUNCTION g()\n  obtain the thing somehow\nEND'), e => e.line === 2 && /Unrecognized/.test(e.message)); });
test('code-lift outline becomes stubs', () => { const r = convertCodeLift(F('.pseudo/src/cart.js.md')); const m = load(r.code); assert.equal(typeof m.total, 'function'); assert.equal(typeof m.Cart, 'function'); assert.deepEqual(r.functions.sort(), ['Cart', 'applyCoupon', 'total']); });
test('rejects unsafe identifiers (sandboxing crawled pseudocode)', () => { assert.throws(() => convertPseudo('FUNCTION h()\n  CALL require("child_process").execSync("id")\nEND'), /Unsafe identifier "require"/); });
test('DECLARE (Cambridge-style) and brace FUNCTION headers', () => { const r = load(convertPseudo('DECLARE Total : INTEGER\nFUNCTION add(a, b) {\n  Total <- a + b\n  RETURN Total\n}').code); assert.equal(r.add(2, 3), 5); });
