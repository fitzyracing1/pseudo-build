'use strict';
// Deterministic pseudocode -> JavaScript translator (no LLMs, no network).
const ID = '[A-Za-z_][\\w]*';

function expr(e) {
  return e.trim()
    .replace(/\b(length|size) of (\w[\w.]*)/gi, '$2.length').replace(/\bLENGTH\((\w[\w.]*)\)/g, '$1.length').replace(/<-/g, '=')
    .replace(/\bMOD\b/g, '%').replace(/\bDIV\b/g, '/')
    .replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||').replace(/\bNOT\b/gi, '!')
    .replace(/\bTRUE\b/gi, 'true').replace(/\bFALSE\b/gi, 'false').replace(/\b(NULL|NIL|NONE)\b/gi, 'null')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠|<>/g, '!==')
    .replace(/(^|[^=!<>])=(?!=)/g, '$1===');
}
const rhs = e => expr(e).replace(/===/g, '==='); // same rules for values

function stripTypes(params) { return params.split(',').map(p => p.trim().replace(/[:=].*$/, '').replace(/^\*+/, '').trim().split(/\s+/).pop()).filter(Boolean).join(', '); }

// Returns { code, functions, tests } or throws { line, message }.
function convertPseudo(src) {
  const out = [], functions = [], tests = [], declared = [new Set()];
  const stack = []; // {indent, kind}
  const lines = src.split('\n');
  const err = (i, msg) => { const e = new Error(msg); e.line = i + 1; e.source = lines[i]; throw e; };
  const pad = () => '  '.repeat(stack.length);
  const close = upto => { while (stack.length && stack[stack.length - 1].indent >= upto) { const b = stack.pop(); declared.pop(); out.push(pad() + (b.kind === 'repeat' ? '' : '}')); } };
  const open = (indent, kind, line) => { out.push(pad() + line); stack.push({ indent, kind }); declared.push(new Set()); };
  const assign = (name, val) => { const known = declared.some(s => s.has(name.split(/[.[]/)[0])); if (!known && !/[.[]/.test(name)) declared[declared.length - 1].add(name); return `${known || /[.[]/.test(name) ? '' : 'let '}${name} = ${rhs(val)};`; };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\t/g, '    ');
    let t = raw.trim(); const ind = raw.match(/^\s*/)[0].length;
    if (!t) continue;
    let m;
    if ((m = t.match(/^(?:ASSERT|TEST|EXAMPLE)[:\s]+(.+?)\s*(?:->|==|=>|→)\s*(.+)$/i))) { tests.push({ call: m[1].trim(), expect: rhs(m[2]), line: i + 1 }); continue; }
    if (/^(?:pseudo[\s-]?code|algorithm|steps?|procedure|input|output)\b[^:]*:\s*$/i.test(t) || /^(?:pseudo[\s-]?code)\b.*:\s*$/i.test(t)) { out.push(pad() + '// ' + t); continue; }
    if (/^(\/\/|#|--)/.test(t)) { out.push(pad() + '// ' + t.replace(/^(\/\/|#|--)\s*/, '')); continue; }
    if (/^(END\b|ENDIF|ENDFOR|ENDWHILE|ENDFUNCTION|NEXT\b|DONE\b|\})/i.test(t)) {
      if (!stack.length) err(i, `"${t.split(/\s/)[0]}" without an open block`);
      close(stack[stack.length - 1].indent); continue;
    }
    if ((m = t.match(/^(?:ELSE\s*IF|ELSEIF|ELIF)\s+(.+?)(?:\s+THEN)?:?$/i))) { close(ind + 1); if (!stack.length || stack[stack.length - 1].kind !== 'if') err(i, 'ELSE IF without IF'); out[out.length] = pad().slice(2) + `} else if (${expr(m[1])}) {`; continue; }
    if (/^ELSE:?$/i.test(t)) { close(ind + 1); if (!stack.length || stack[stack.length - 1].kind !== 'if') err(i, 'ELSE without IF'); out.push(pad().slice(2) + '} else {'); continue; }
    if ((m = t.match(/^UNTIL\s+(.+)$/i))) { close(ind + 1); const b = stack.pop(); declared.pop(); if (!b || b.kind !== 'repeat') err(i, 'UNTIL without REPEAT'); out.push(pad() + `} while (!(${expr(m[1])}));`); continue; }
    close(ind);
    if ((m = t.match(new RegExp(`^(?:FUNCTION|PROCEDURE|ALGORITHM|FUNC|DEF)\\s+(${ID})\\s*\\(([^)]*)\\)\\s*(?:->.*|RETURNS.*)?\\s*[:{]?$`, 'i')))) {
      functions.push(m[1]); open(ind, 'fn', `function ${m[1]}(${stripTypes(m[2])}) {`); declared[declared.length - 1] = new Set(stripTypes(m[2]).split(', ')); continue;
    }
    if ((m = t.match(new RegExp(`^(?:DECLARE|VAR)\\s+(${ID}(?:\\s*,\\s*${ID})*)\\s*:\\s*(.+)$`, 'i')))) {
      const isArr = /^ARRAY/i.test(m[2]); for (const v of m[1].split(',').map(x => x.trim())) { if (!declared.some(d => d.has(v))) { declared[declared.length - 1].add(v); out.push(pad() + `let ${v}${isArr ? ' = []' : ''};`); } } continue;
    }
    if ((m = t.match(/^IF\s+(.+?)(?:\s+THEN)?:?$/i))) { open(ind, 'if', `if (${expr(m[1])}) {`); continue; }
    if ((m = t.match(new RegExp(`^FOR\\s+(?:EACH\\s+)?(${ID})\\s+IN\\s+(.+?)(?:\\s+DO)?:?$`, 'i')))) { open(ind, 'loop', `for (const ${m[1]} of ${rhs(m[2])}) {`); declared[declared.length - 1].add(m[1]); continue; }
    if ((m = t.match(new RegExp(`^FOR\\s+(${ID})\\s*(?:FROM|=|←|:=|<-)\\s*(.+?)\\s+(DOWN\\s*)?TO\\s+(.+?)(?:\\s+STEP\\s+(.+?))?(?:\\s+DO)?:?$`, 'i')))) {
      const dn = !!m[3], st = m[5] ? rhs(m[5]) : '1';
      open(ind, 'loop', `for (let ${m[1]} = ${rhs(m[2])}; ${m[1]} ${dn ? '>=' : '<='} ${rhs(m[4])}; ${m[1]} ${dn ? '-=' : '+='} ${st}) {`); declared[declared.length - 1].add(m[1]); continue;
    }
    if ((m = t.match(/^WHILE\s+(.+?)(?:\s+DO)?:?$/i))) { open(ind, 'loop', `while (${expr(m[1])}) {`); continue; }
    if (/^REPEAT:?$/i.test(t)) { open(ind, 'repeat', 'do {'); continue; }
    if ((m = t.match(/^(?:INPUT|READ)\s+(\S+)$/i))) { out.push(pad() + `${declared.some(d => d.has(m[1])) ? '' : 'let '}${m[1]} = __input.shift(); // INPUT`); declared[declared.length - 1].add(m[1]); continue; }
    if ((m = t.match(/^RETURN\b\s*(.*)$/i))) { out.push(pad() + `return ${m[1] ? rhs(m[1]) : ''};`.replace(' ;', ';')); continue; }
    if ((m = t.match(/^(?:PRINT|OUTPUT|DISPLAY|WRITE)\s+(.+)$/i))) { out.push(pad() + `console.log(${rhs(m[1])});`); continue; }
    if ((m = t.match(/^(?:BREAK)$/i))) { out.push(pad() + 'break;'); continue; }
    if ((m = t.match(/^(?:CONTINUE)$/i))) { out.push(pad() + 'continue;'); continue; }
    if ((m = t.match(/^APPEND\s+(.+?)\s+TO\s+(.+)$/i))) { out.push(pad() + `${m[2].trim()}.push(${rhs(m[1])});`); continue; }
    if ((m = t.match(/^SWAP\s+(.+?)\s+(?:AND|WITH)\s+(.+)$/i))) { out.push(pad() + `[${m[1]}, ${m[2]}] = [${m[2]}, ${m[1]}];`); continue; }
    if ((m = t.match(/^(?:INCREMENT|INCREASE)\s+(\S+)(?:\s+BY\s+(.+))?$/i))) { out.push(pad() + `${m[1]} += ${m[2] ? rhs(m[2]) : 1};`); continue; }
    if ((m = t.match(/^(?:DECREMENT|DECREASE)\s+(\S+)(?:\s+BY\s+(.+))?$/i))) { out.push(pad() + `${m[1]} -= ${m[2] ? rhs(m[2]) : 1};`); continue; }
    if ((m = t.match(/^(?:SET|LET)\s+(.+?)\s+(?:TO|=|←|:=)\s+(.+)$/i)) || (m = t.match(/^([A-Za-z_][\w.]*(?:\[[^\]]+\])*)\s*(?:←|:=|<-|=(?!=))\s*(.+)$/))) { out.push(pad() + assign(m[1].trim(), m[2])); continue; }
    if ((m = t.match(/^(?:CALL\s+)?([A-Za-z_][\w.]*\(.*\))$/i))) { out.push(pad() + rhs(m[1]) + ';'); continue; }
    err(i, `Unrecognized pseudocode statement: "${t.slice(0, 80)}"`);
  }
  close(-1);
  const bad = out.join('\n').replace(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\/\/.*$/gm, '').match(/\b(require|process|eval|Function|import|globalThis|global|module|exports|constructor|__proto__|child_process|fetch)\b/);
  if (bad) err(0, `Unsafe identifier "${bad[1]}" is not allowed in converted pseudocode`);
  if (!functions.length && !tests.length && !out.some(l => l.trim() && !l.trim().startsWith('//'))) err(0, 'No convertible statements found');
  const code = `'use strict';\nconst __input = [];\nconst INT = Math.trunc, RAND = n => Math.random() * n, ROUND = (x, d = 0) => +x.toFixed(d), UCASE = s => s.toUpperCase(), LCASE = s => s.toLowerCase(), MID = (s, a, n) => s.substr(a - 1, n), SUBSTRING = MID, ASC = c => c.charCodeAt(0), CHR = n => String.fromCharCode(n), NUM_TO_STR = String, STR_TO_NUM = Number;\n${out.join('\n')}\nmodule.exports = { ${functions.join(', ')} };\n`;
  try { new Function(code.replace(/^'use strict';/, '')); } catch (e) { const x = new Error('Generated code does not compile: ' + e.message); x.line = 0; x.generated = code; throw x; }
  return { code, functions, tests };
}

// code-lift .pseudo/*.md outline -> JS stubs (outline has no executable body).
function convertCodeLift(md) {
  const fns = [], classes = {};
  for (const m of md.matchAll(/^## (?:async )?(FUNCTION|METHOD|CLASS|STRUCT|INTERFACE) ([\w.$]+)(?:\(([^)]*)\))?/gm)) {
    const [, kind, name, params = ''] = m;
    if (kind === 'METHOD' && name.includes('.')) { const [c, f] = name.split('.'); (classes[c] ||= []).push([f, stripTypes(params)]); }
    else if (kind === 'FUNCTION') fns.push([name, stripTypes(params)]);
    else classes[name] ||= [];
  }
  if (!fns.length && !Object.keys(classes).length) { const e = new Error('code-lift outline contains no symbols'); e.line = 0; throw e; }
  const stub = n => `{ throw new Error('${n}: outline only (from code-lift pseudocode)'); }`;
  const body = [...fns.map(([n, p]) => `function ${n}(${p}) ${stub(n)}`),
    ...Object.entries(classes).map(([c, ms]) => `class ${c} {\n${ms.map(([f, p]) => f === 'constructor' || f === '__init__' ? `  constructor(${p.replace(/^self,?\s*/, '')}) {}` : `  ${f}(${p.replace(/^self,?\s*/, '')}) ${stub(c + '.' + f)}`).join('\n')}\n}`)];
  const names = [...fns.map(f => f[0]), ...Object.keys(classes)];
  const code = `'use strict';\n${body.join('\n')}\nmodule.exports = { ${names.join(', ')} };\n`;
  try { new Function(code.replace(/^'use strict';/, '')); } catch (e) { const x = new Error('Generated code does not compile: ' + e.message); x.line = 0; x.generated = code; throw x; }
  return { code, functions: names, tests: [] };
}

function testFile(conv) {
  const lines = [`const test = require('node:test'), assert = require('node:assert');`, `const M = require('./index.js');`, `const { ${conv.functions.join(', ')} } = M;`];
  lines.push(`test('defines ${conv.functions.join(', ') || 'module'}', () => { ${conv.functions.map(f => `assert.equal(typeof M.${f}, 'function');`).join(' ')} });`);
  conv.tests.forEach((t, n) => lines.push(`test(${JSON.stringify(`example ${n + 1} (pseudo line ${t.line}): ${t.call}`)}, () => { assert.deepStrictEqual(${t.call}, ${t.expect}); });`));
  return lines.join('\n') + '\n';
}
module.exports = { convertPseudo, convertCodeLift, testFile, expr };
