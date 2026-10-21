'use strict';
// Pull pseudocode units out of fetched files.
// Kinds: code-lift (.pseudo/**/*.md outline), pseudo-file (*.pseudo), md-block (```pseudo / ```pseudocode fences).
function kindOf(path) {
  if (/(^|\/)\.pseudo\/.+\.md$/.test(path)) return 'code-lift';
  if (/\.pseudo$/i.test(path)) return 'pseudo-file';
  if (/\.(md|markdown)$/i.test(path)) return 'md-block';
  return null;
}
function extractUnits(path, text) {
  const kind = kindOf(path);
  if (kind === 'code-lift' || kind === 'pseudo-file') return [{ kind, index: 0, text, startLine: 1 }];
  if (kind !== 'md-block') return [];
  const units = []; const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)\s*(pseudo|pseudocode)\b/i.test(lines[i])) {
      const fence = lines[i].trim().slice(0, 3); const body = [];
      let j = i + 1; for (; j < lines.length && !lines[j].trim().startsWith(fence); j++) body.push(lines[j]);
      units.push({ kind, index: units.length, text: body.join('\n'), startLine: i + 2 }); i = j;
    }
  }
  return units;
}
module.exports = { extractUnits, kindOf };
