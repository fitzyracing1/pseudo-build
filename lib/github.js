'use strict';
// Read-only GitHub client over the `gh` CLI (uses existing auth; token never read or printed).
// Only GET requests are possible through get(); writes live in issues.js and are restricted to the owner's repo.
const { execFileSync } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ghClient({ minIntervalMs = 6500 } = {}) {   // code search: 10 req/min authenticated
  let last = 0;
  async function call(method, route, { fields = {}, accept, input } = {}) {
    const wait = last + minIntervalMs - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now();
    const args = ['api', '-X', method, route, '-i'];
    if (accept) args.push('-H', `Accept: ${accept}`);
    for (const [k, v] of Object.entries(fields)) args.push(method === 'GET' ? '-f' : '-F', `${k}=${v}`);
    if (input) args.push('--input', '-');
    let raw;
    try { raw = execFileSync('gh', args, { input: input ? JSON.stringify(input) : undefined, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 << 20 }).toString(); }
    catch (e) { raw = (e.stdout || '').toString(); if (!raw) throw new Error(`gh api ${method} ${route} failed`); }
    const sep = raw.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
    const [head, ...b] = raw.split(sep); const body = b.join(sep);
    const status = +(head.match(/HTTP\/[\d.]+ (\d+)/) || [])[1];
    const remaining = +(head.match(/x-ratelimit-remaining:\s*(\d+)/i) || [])[1];
    const reset = +(head.match(/x-ratelimit-reset:\s*(\d+)/i) || [])[1];
    if ((status === 403 || status === 429) && reset) {           // respect rate limit: wait for reset once
      const ms = Math.min(reset * 1000 - Date.now() + 1000, 70000); if (ms > 0) { await sleep(ms); return call(method, route, { fields, accept, input }); }
    }
    if (remaining === 0 && reset) { const ms = Math.min(reset * 1000 - Date.now() + 1000, 70000); if (ms > 0) await sleep(ms); }
    if (status >= 400) throw new Error(`GitHub ${status} for ${method} ${route}`);
    if (accept && accept.includes('raw')) return body;
    try { return JSON.parse(body); } catch { return body; }
  }
  return {
    get: (route, opts) => call('GET', route, opts),
    write: (method, route, input) => call(method, route, { input }),   // used only by issues.js (guarded)
  };
}
module.exports = { ghClient };
