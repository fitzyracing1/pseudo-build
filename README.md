# pseudo-build

Crawls **public GitHub** for pseudocode, turns it into code locally, runs the generated tests, and marks each result **lit** (converted and tests pass) or **dark** (didn't convert, or tests fail).
Sources: code-lift output (`.pseudo/**/*.md`), `*.pseudo` files, and fenced ` ```pseudo ` / ` ```pseudocode ` blocks in Markdown.

Zero dependencies, Node ≥ 20, uses the existing `gh` login. Author: Joshua Almeida ([@fitzyracing1](https://github.com/fitzyracing1)). MIT.

```
pseudo-build crawl [--limit 20]     # GitHub code search + content fetch (GET only), convert, test -> out/results.json
pseudo-build rebuild                # re-convert/re-test cached sources offline
pseudo-build issues                 # DRY-RUN (default): out/issues/<key>.md + out/issues.json
pseudo-build issues --file --repo fitzyracing1/pseudo-build   # real filing (later, once the repo exists)
pseudo-build board                  # board/index.html (dark list, lit/dark counts, filters, links)
```

## Safety
- The crawl is read-only. It respects the code-search limit (≥6.5 s between calls) and waits on `x-ratelimit-reset` when it hits 403/429.
- Issues go **only** to `fitzyracing1/pseudo-build`. Any other `--repo` is refused, and nothing is ever posted to a crawled repo.
- Dedupe key = sha256(source URL + unit + content hash). A rerun updates the existing issue (or reopens it). When the same source turns lit, the issue gets a comment and is closed.
- Crawled pseudocode is untrusted: the converter only emits a small fixed set of JS constructs and rejects `require/process/eval/Function/import/global…`. Tests run under Node's permission model, which allows reading only that unit's folder: no writes, no child processes.

## Output
`out/<owner>/<repo>/<path>[.blockN]/{source.pseudo,index.js,test.js}`, `out/results.json`, `out/issues/*.md`, `out/issues.json`.

## Automation
`templates/crawl.yml` runs every 6 hours: tests, then crawl, then file/update/close issues in this repo, then publish the board to GitHub Pages.
For code search it needs a read-only `CRAWL_TOKEN` secret. A self-hosted runner works too: set `runs-on: [self-hosted, linux]`.

## Tests
`npm test`: 15 offline tests using fixtures and a mocked GitHub API.

## Plans

This project is free, and its license stays as is. Support it through [GitHub Sponsors](https://github.com/sponsors/fitzyracing1):

- **Free**: use the code, community support.
- **Pro ($49/month)**: priority issues and support.
- **Team ($199/month)**: priority support for your team plus early access.
