'use strict';
// Pull pseudocode units out of fetched files of (almost) any type.
// Source kinds (used for crawl slot sharing + labels): code-lift, pseudo-file, markdown, notebook, text, source.
// Unit kinds: code-lift, pseudo-file, md-block, md-indented, notebook-cell, text-section, rst-block, tex-algorithm, org-block, source-comment, docstring.
const MAX_BYTES = 300 * 1024;
const EXT = {
  markdown: /\.(md|markdown|mdx)$/i, notebook: /\.ipynb$/i, text: /\.(txt|rst|tex|org|text)$/i,
  source: /\.(py|pyw|js|mjs|cjs|jsx|ts|tsx|java|c|h|cc|cpp|cxx|hpp|go|rs|rb|cs|php|swift|kt|kts|scala|m|lua|pl|sh|r|jl|dart|sql)$/i,
};
function sourceKindOf(path) {
  if (/(^|\/)\.pseudo\/.+\.md$/.test(path)) return 'code-lift';
  if (/\.(pseudo|pseudocode|pseudo\.txt)$/i.test(path)) return 'pseudo-file';
  for (const [k, re] of Object.entries(EXT)) if (re.test(path)) return k;
  return null;
}
const kindOf = sourceKindOf; // back-compat

const KW = /^\s*(?:\d+[.)]\s*)?(?:IF\b|ELSE\b|ELSEIF\b|ELIF\b|END\s*(?:IF|FOR|WHILE|FUNCTION|PROCEDURE)?\b|ENDIF\b|ENDWHILE\b|ENDFOR\b|FOR\s+(?:EACH\s+)?\w+\s+(?:IN|FROM|<-|←|:=|=)|WHILE\b|REPEAT\b|UNTIL\b|RETURN\b|SET\s+\w|LET\s+\w|FUNCTION\s+\w+\s*\(|PROCEDURE\s+\w|ALGORITHM\b|BEGIN\b|DECLARE\s+\w|INPUT\s+\w|OUTPUT\b|PRINT\b|CALL\s+\w|STEP\s+\d+\b|\w+\s*(?:<-|←|:=)\s*\S)/i;
const UPPERKW = /^\s*(?:IF|ELSE|ENDIF|END IF|ENDWHILE|END WHILE|ENDFOR|END FOR|FOR|WHILE|REPEAT|UNTIL|RETURN|SET|FUNCTION|PROCEDURE|BEGIN|END|DECLARE|INPUT|OUTPUT|PRINT|CALL|Step \d+)\b/;
// Heuristic: does this block read like pseudocode (vs prose or real code)?
function pseudoScore(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return 0;
  const kw = lines.filter(l => KW.test(l)).length, upper = lines.filter(l => UPPERKW.test(l)).length;
  const codey = lines.filter(l => /[;{}]\s*$|^\s*(import|#include|package|using|public|private|const|var|let)\b|=>|::/.test(l)).length;
  const mention = /pseudo[\s-]?code|algorithm\s*[:\d]/i.test(text) ? 0.15 : 0;
  return Math.max(0, (kw + upper) / (2 * lines.length) + mention - codey / lines.length);
}
const looksPseudo = (t, min = 0.35) => pseudoScore(t) >= min && t.split('\n').filter(l => l.trim()).length >= 3;

const unit = (kind, index, text, startLine, extra = {}) => ({ kind, index, text: text.replace(/\s+$/, ''), startLine, ...extra });

function markdownUnits(text, kindPrefix = 'md', lineOffset = 0) {
  const units = []; const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
    if (f) {
      const fence = f[1]; const lang = (f[2] || '').toLowerCase(); const body = [];
      let j = i + 1; for (; j < lines.length && !lines[j].trim().startsWith(fence); j++) body.push(lines[j]);
      const t = body.join('\n'); const tagged = /^(pseudo|pseudocode|algorithm)$/.test(lang);
      if (tagged || ((!lang || /^(text|txt|plain|none)$/.test(lang)) && looksPseudo(t))) units.push(unit(kindPrefix === 'md' ? 'md-block' : kindPrefix, units.length, t, lineOffset + i + 2, { tagged }));
      i = j; continue;
    }
    if (/^( {4}|\t)\S/.test(lines[i]) && (i === 0 || !lines[i - 1].trim())) {   // indented block
      const body = []; let j = i; for (; j < lines.length && (/^( {4}|\t)/.test(lines[j]) || !lines[j].trim()); j++) body.push(lines[j].replace(/^( {4}|\t)/, ''));
      const t = body.join('\n'); if (looksPseudo(t)) units.push(unit(kindPrefix === 'md' ? 'md-indented' : kindPrefix, units.length, t, lineOffset + i + 1));
      i = j - 1;
    }
  }
  return units;
}

function notebookUnits(text) {
  let nb; try { nb = JSON.parse(text); } catch { return []; }
  const out = [];
  (nb.cells || []).forEach((c, ci) => {
    const src = Array.isArray(c.source) ? c.source.join('') : String(c.source || '');
    if (c.cell_type === 'markdown') {
      const md = markdownUnits(src, 'notebook-cell');
      if (md.length) md.forEach(u => out.push({ ...u, kind: 'notebook-cell', cell: ci, index: out.length }));
      else if (/pseudo[\s-]?code/i.test(src) && looksPseudo(src, 0.3)) out.push(unit('notebook-cell', out.length, src, 1, { cell: ci }));
    } else if (c.cell_type === 'code') commentUnits(src, 'x.py').forEach(u => out.push({ ...u, cell: ci, index: out.length }));
  });
  return out;
}

function textUnits(path, text) {
  const out = []; const lines = text.split('\n');
  if (/\.tex$/i.test(path)) {
    for (const m of text.matchAll(/\\begin\{algorithmic\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{algorithmic\}/g)) out.push(unit('tex-algorithm', out.length, texToPseudo(m[1]), text.slice(0, m.index).split('\n').length + 1));
    return out;
  }
  if (/\.org$/i.test(path)) {
    for (const m of text.matchAll(/#\+BEGIN_SRC\s*(\w*)[^\n]*\n([\s\S]*?)#\+END_SRC/gi)) if (/pseudo|^$/i.test(m[1]) && (m[1] || looksPseudo(m[2]))) out.push(unit('org-block', out.length, m[2], text.slice(0, m.index).split('\n').length + 1));
  }
  if (/\.rst$/i.test(path)) {
    for (let i = 0; i < lines.length; i++) {
      const d = lines[i].match(/^(\s*)(?:\.\. (?:code-block|code|sourcecode)::\s*(\w*)|.*::\s*$)/);
      if (!d) continue; const lang = d[2] || ''; const body = []; let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const ind = (lines[j] || '').match(/^\s*/)[0].length; if (ind <= d[1].length) continue;
      for (; j < lines.length && (!lines[j].trim() || lines[j].match(/^\s*/)[0].length >= ind); j++) body.push(lines[j].slice(ind));
      const t = body.join('\n'); if (/pseudo/i.test(lang) || ((!lang || lang === 'text') && looksPseudo(t))) out.push(unit('rst-block', out.length, t, i + 2));
      i = j - 1;
    }
    if (out.length) return out;
  }
  if (out.length) return out;
  // plain text: paragraphs (blank-line separated) that read like pseudocode; merge adjacent ones
  let start = 0; const paras = [];
  for (let i = 0; i <= lines.length; i++) if (i === lines.length || !lines[i].trim()) { if (i > start) paras.push([start, lines.slice(start, i).join('\n')]); start = i + 1; }
  let cur = null;
  for (const [s, p] of paras) {
    if (looksPseudo(p, 0.4) || (cur && pseudoScore(p) >= 0.3)) { if (cur) cur.text += '\n' + p; else cur = unit('text-section', out.length, p, s + 1); }
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((u, i) => ({ ...u, index: i }));
}

function texToPseudo(s) {
  return s.split('\n').map(l => l.match(/^\s*/)[0] + l.trim()
    .replace(/%.*$/, '')
    .replace(/\\Function\{(\w+)\}\{([^}]*)\}/, 'FUNCTION $1($2)').replace(/\\Procedure\{(\w+)\}\{([^}]*)\}/, 'FUNCTION $1($2)')
    .replace(/\\EndFunction|\\EndProcedure/, 'END FUNCTION').replace(/\\ElsIf\{(.*)\}/, 'ELSE IF $1 THEN').replace(/\\If\{(.*)\}/, 'IF $1 THEN')
    .replace(/\\Else\b/, 'ELSE').replace(/\\EndIf/, 'END IF').replace(/\\ForAll\{(.*)\}|\\For\{(.*)\}/, (m, a, b) => 'FOR ' + (a || b).replace(/\\in\b/g, 'IN').replace(/\s*(?:\\gets|=)\s*(\S+)\s*,?\s*\\ldots,?\s*/, ' FROM $1 TO ').replace(/\s+to\s+/i, ' TO '))
    .replace(/\\EndFor/, 'END FOR').replace(/\\While\{(.*)\}/, 'WHILE $1').replace(/\\EndWhile/, 'END WHILE').replace(/\\Repeat/, 'REPEAT').replace(/\\Until\{(.*)\}/, 'UNTIL $1')
    .replace(/\\State\s*/, '').replace(/\\Return\b/, 'RETURN').replace(/\\Comment\{(.*)\}/, '// $1')
    .replace(/\\gets/g, '<-').replace(/\\leq?/g, '<=').replace(/\\geq?/g, '>=').replace(/\\neq?/g, '!=').replace(/\\(?:land|wedge)/g, 'AND').replace(/\\(?:lor|vee)/g, 'OR')
    .replace(/\\(?:Call|textsc|textbf|textit|mathit|text)\{([^}]*)\}/g, '$1').replace(/\$/g, '').replace(/\\(?:left|right)/g, '')
  ).filter(l => l.trim()).join('\n');
}

// Comment + docstring blocks in source files. Only blocks that read like pseudocode are kept.
function commentUnits(text, path) {
  const out = []; const lines = text.split('\n');
  const hash = /\.(py|pyw|rb|sh|r|jl|pl)$/i.test(path), slash = !/\.(py|pyw|sh|r)$/i.test(path);
  const push = (kind, body, line) => { if (looksPseudo(body)) out.push(unit(kind, out.length, body, line)); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (slash && /^\s*\/\*/.test(l)) {
      const body = []; let j = i;
      for (; j < lines.length; j++) { body.push(lines[j].replace(/^\s*\/\*+\s?|\s*\*+\/\s*$|^\s*\*\s?/g, '')); if (/\*\//.test(lines[j])) break; }
      push('source-comment', body.join('\n'), i + 1); i = j; continue;
    }
    const lead = slash && /^\s*\/\/(?!\/)/.test(l) ? /^\s*\/\/\s?/ : hash && /^\s*#(?!!)/.test(l) ? /^\s*#\s?/ : (/\.(sql|lua)$/i.test(path) && /^\s*--/.test(l) ? /^\s*--\s?/ : null);
    if (lead) {
      const body = []; let j = i; for (; j < lines.length && lead.test(lines[j]); j++) body.push(lines[j].replace(lead, ''));
      push('source-comment', body.join('\n'), i + 1); i = j - 1; continue;
    }
    const ds = /\.(py|pyw)$/i.test(path) && l.match(/^\s*[rubf]*("""|''')(.*)$/i);
    if (ds) {
      const q = ds[1]; const body = [];
      if (ds[2].includes(q)) { continue; }
      body.push(ds[2]); let j = i + 1; for (; j < lines.length && !lines[j].includes(q); j++) body.push(lines[j]);
      if (j < lines.length) body.push(lines[j].split(q)[0]);
      const min = Math.min(...body.slice(1).filter(x => x.trim()).map(x => x.match(/^\s*/)[0].length), 99);
      push('docstring', [body[0], ...body.slice(1).map(x => x.slice(min === 99 ? 0 : min))].join('\n'), i + 1); i = j;
    }
  }
  return out;
}

function isBinaryText(text) { return /\u0000/.test(text.slice(0, 8000)); }

function extractUnits(path, text) {
  const sk = sourceKindOf(path);
  if (!sk || typeof text !== 'string' || text.length > MAX_BYTES || isBinaryText(text)) return [];
  let units;
  if (sk === 'code-lift' || sk === 'pseudo-file') units = [unit(sk, 0, text, 1)];
  else if (sk === 'markdown') units = markdownUnits(text);
  else if (sk === 'notebook') units = notebookUnits(text);
  else if (sk === 'text') units = textUnits(path, text);
  else units = commentUnits(text, path);
  return units.map((u, i) => ({ ...u, index: i, sourceKind: sk }));
}
module.exports = { extractUnits, kindOf, sourceKindOf, pseudoScore, looksPseudo, markdownUnits, notebookUnits, textUnits, commentUnits, texToPseudo, MAX_BYTES };
