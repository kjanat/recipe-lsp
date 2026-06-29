# Contributing

## Local dev

`tree-sitter-recipe` is a published dependency, so a plain install pulls the
grammar (and its wasm) from the registry:

```bash
bun install
```

## Scripts

```bash
bun lsp             # run the server from source over stdio (bun server.ts --stdio)
bun bd              # build to dist/ via tsdown
bun start           # build, then run dist/server.js --stdio
bun test            # run the test suite
bun run typecheck   # tsc --noEmit
bun run check       # biome check
bun fmt             # dprint fmt
```

## Tests

`bun test` covers the analysis units plus a `dist/` smoke suite. The
browser-worker end-to-end test launches headless Chromium (via Playwright) and
drives the built `dist/browser.js` worker through a real LSP handshake; it
**skips** when no browser binary is installed:

```bash
bunx playwright install chromium   # one-time, enables the worker e2e
```

A second, opt-in end-to-end test hits the **live CDN** against the _published_
package — run it after publishing to confirm `new Worker(cdnUrl)` still works:

```bash
CDN_E2E=1 bun test tests/e2e/cdn-worker.test.ts
CDN_E2E=1 CDN_E2E_URL="https://cdn.jsdelivr.net/npm/recipe-lsp@<version>/dist/browser.js" bun test tests/e2e/cdn-worker.test.ts
```

## Architecture notes

- The server reparses the whole document on change. Recipe files are tiny;
  simple wins.
- Tree-sitter reports positions in UTF-8 bytes; `recipe-lsp` converts them to
  LSP UTF-16 positions so diagnostics and hovers stay correct on accented text.
- Analysis code is runtime-agnostic; only `server.ts` and
  `src/runtime/node-analyzer.ts` are Node-specific. The universal `mod.ts` entry
  lazily loads the browser or Node analyzer at call time.

## Releasing

`jsr.json` and `package.json` versions must match (CI gates on it). Push a
GPG-signed `vX.Y.Z` tag on `master`; `release.yml` then publishes to npm and JSR
via OIDC trusted publishing — no tokens.

<!-- rumdl-disable-file MD013 -->
