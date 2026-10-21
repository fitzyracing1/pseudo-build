'use strict';
const fs = require('fs'), path = require('path');
const F = p => fs.readFileSync(path.join(__dirname, 'fixtures', p), 'utf8');
const FILES = { 'repos/alice/algos/contents/algos/fib.pseudo': F('fib.pseudo'), 'repos/bob/notes/contents/README.md': F('README.md'), 'repos/carol/shop/contents/.pseudo/src/cart.js.md': F('.pseudo/src/cart.js.md') };
// Offline mock of the GitHub API with an in-memory issue tracker.
function mockClient() {
  const calls = [], issues = []; let n = 0;
  return {
    calls, issues,
    async get(route, opts = {}) {
      calls.push(['GET', route, opts.fields]);
      if (route === 'search/code') return JSON.parse(F('search.json'));
      if (FILES[route] !== undefined) return FILES[route];
      if (/^repos\/[^/]+\/[^/]+\/issues$/.test(route)) return issues.map(i => ({ ...i }));
      throw new Error('404 ' + route);
    },
    async write(method, route, body) {
      calls.push([method, route, body]);
      if (method === 'POST' && /\/issues$/.test(route)) { const i = { number: ++n, state: 'open', ...body, html_url: `https://github.com/fitzyracing1/pseudo-build/issues/${n}` }; issues.push(i); return i; }
      const m = route.match(/issues\/(\d+)$/); if (method === 'PATCH' && m) { Object.assign(issues.find(i => i.number === +m[1]), body); return {}; }
      return {};
    },
  };
}
module.exports = { mockClient, F };
