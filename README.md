# recipe-lsp

`recipe-lsp` is a Language Server Protocol implementation for the Recipe
pharmacological notation language with two entrypoints:

- Node stdio server: `recipe-lsp`
- Browser worker server: `recipe-lsp/browser`

## Features

- Tree-sitter-backed syntax diagnostics
- Lightweight section-order warnings (`R/` -> `Da/` -> `S/`)
- Document symbols for recipe sections
- Hover help for markers, units, and Latin abbreviations
- Context-aware completions: section markers at line start, dose units right
  after a number, and abbreviations scoped to the `R/`/`Da/`/`S/` section the
  cursor sits in
- Semantic tokens, folding ranges, and selection ranges

## Local dev

`tree-sitter-recipe` is a published dependency, so a plain install pulls the
grammar (and its wasm) from the registry:

```bash
bun install
```

To develop against an unpublished local grammar, link the sibling checkout
first:

```bash
cd ../tree-sitter-recipe && bun link
cd ../recipe-lsp && bun link tree-sitter-recipe
```

Build once, then run with Node:

```bash
bun bd
node ./dist/server.mjs --stdio
```

`bun start` also builds first via `prestart`.

## CLI usage

The Node server needs exactly one transport flag:

```bash
recipe-lsp --stdio
recipe-lsp --node-ipc
recipe-lsp --socket=3000
```

For help:

```bash
recipe-lsp --help
```

If you run `recipe-lsp` without a transport flag, it prints a short usage guide
instead of a raw stack trace.

## Browser worker

The browser entrypoint is emitted as `dist/browser.js`.
tsdown emits the wasm assets it imports as sibling files at runtime:

- `dist/web-tree-sitter.wasm`
- `dist/tree-sitter-recipe.wasm`

The worker can be served directly from `dist/` or rebundled by an app:

```ts
new Worker(new URL("recipe-lsp/dist/browser.js", import.meta.url), {
  type: "module",
});
```

For local dev without a build step, use Bun:

```bash
bun dev
```

Run tests with Bun too:

```bash
bun test
```

## Notes

- The server reparses the whole document on change.
  Recipe files are tiny; simple wins.
- Tree-sitter reports positions in UTF-8 bytes. `recipe-lsp` converts them to
  LSP UTF-16 positions so diagnostics and hovers stay correct on accented text.
- Shared analysis code is browser-safe; only `server.ts` and
  `src/runtime/node-analyzer.ts` are Node-specific.
