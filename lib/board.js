'use strict';
const fs = require('fs'), path = require('path');
function buildBoard(issuesDoc, outFile) {
  const data = JSON.stringify(issuesDoc).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>pseudo-build board</title><style>
body{font:15px system-ui;margin:0;background:#0d0d10;color:#e8e8ee}header{padding:1.2rem 2rem;border-bottom:1px solid #2a2a33}
h1{margin:0 0 .3rem;font-size:1.4rem}.c{display:inline-block;margin-right:1rem;font-weight:600}.lit{color:#ffd24a}.dark{color:#8a8aa0}
.f{padding:1rem 2rem;display:flex;gap:.6rem;flex-wrap:wrap}select,input{background:#1a1a20;color:#eee;border:1px solid #333;padding:.45rem;border-radius:4px}
input{flex:1;min-width:200px}table{width:calc(100% - 4rem);margin:0 2rem 2rem;border-collapse:collapse}td,th{padding:.5rem;border-bottom:1px solid #22222a;text-align:left;vertical-align:top;font-size:.9em}
th{color:#999;font-weight:500}a{color:#8cc8ff}.tag{font-size:.75em;padding:.1rem .4rem;border-radius:3px;background:#2a2a35;margin-right:.3rem}.err{color:#c9a0a0;font-family:ui-monospace,monospace;font-size:.82em}
</style></head><body><header><h1>pseudo-build board</h1>
<span class="c lit">● lit <span id="nl"></span></span><span class="c dark">● dark <span id="nd"></span></span><span style="color:#777;font-size:.85em" id="gen"></span></header>
<div class="f"><input id="q" placeholder="Filter by repo, path, error…"><select id="stage"><option value="">all stages</option><option>convert</option><option>test</option></select>
<select id="source"><option value="">all source kinds</option></select><select id="kind"><option value="">all unit kinds</option></select><select id="owner"><option value="">all owners</option></select></div>
<table><thead><tr><th>Status</th><th>Source</th><th>Stage / source / unit kind</th><th>Error</th><th>Issue</th></tr></thead><tbody id="rows"></tbody></table>
<script>const D=${data};const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
document.getElementById('nl').textContent=D.counts.lit;document.getElementById('nd').textContent=D.counts.dark;document.getElementById('gen').textContent='updated '+D.generatedAt;
const fill=(id,f)=>{const el=document.getElementById(id);[...new Set(D.issues.map(f))].filter(Boolean).sort().forEach(o=>el.add(new Option(o,o)));};fill('source',i=>i.sourceKind||i.kind);fill('kind',i=>i.kind);
const os=document.getElementById('owner');[...new Set(D.issues.map(i=>i.owner))].sort().forEach(o=>os.add(new Option(o,o)));
function draw(){const q=document.getElementById('q').value.toLowerCase(),st=document.getElementById('stage').value,k=document.getElementById('kind').value,sk=document.getElementById('source').value,o=os.value;
document.getElementById('rows').innerHTML=D.issues.filter(i=>(!st||i.stage===st)&&(!k||i.kind===k)&&(!sk||(i.sourceKind||i.kind)===sk)&&(!o||i.owner===o)&&(!q||[i.owner,i.repo,i.path,i.error].join(' ').toLowerCase().includes(q))).map(i=>
'<tr><td class="dark">● dark</td><td><a href="'+esc(i.sourceUrl)+'">'+esc(i.owner+'/'+i.repo)+'</a><br><small>'+esc(i.path)+'</small></td><td><span class="tag">'+esc(i.stage)+'</span><span class="tag">'+esc(i.kind)+'</span></td><td class="err">'+esc((i.error||'').slice(0,160))+'</td><td>'+(i.issueUrl?'<a href="'+esc(i.issueUrl)+'">issue</a>':'<a href="../out/'+esc(i.file)+'">draft</a>')+'</td></tr>').join('')||'<tr><td colspan=5>Nothing dark. All lit.</td></tr>';}
['q','stage','kind','source','owner'].forEach(id=>document.getElementById(id).oninput=draw);draw();</script></body></html>`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, html); return outFile;
}
module.exports = { buildBoard };
