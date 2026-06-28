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
