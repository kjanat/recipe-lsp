# recipe-lsp

[![NPM](https://img.shields.io/npm/v/recipe-lsp?logo=npm&labelColor=CB3837&color=black)][npm]
[![JSR](https://img.shields.io/jsr/v/@kjanat/recipe-lsp?logoColor=083344&logo=jsr&logoSize=auto&label=&labelColor=f7df1e&color=black)][jsr]

A Language Server Protocol implementation for the **Recipe** (`.recipe`)
pharmacological-notation language.\
Published to [npm] (`recipe-lsp`) and [JSR] (`jsr:@kjanat/recipe-lsp`), with
three entrypoints:

| Import               | What it is                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| `recipe-lsp`         | The analyzer library — parse recipes, get diagnostics/hover/completions. |
| `recipe-lsp` (bin)   | The Node CLI that runs the language server over a transport.             |
| `recipe-lsp/browser` | A Web Worker entrypoint that runs the server in the browser.             |

## Install

```bash
npm install recipe-lsp        # or: bun add / pnpm add / yarn add
deno add jsr:@kjanat/recipe-lsp
```

## Features

- Tree-sitter-backed syntax diagnostics
- Section-order warnings (`R/` → `Da/` → `S/`)
- Document symbols for recipe sections
- Hover help that expands Latin abbreviations to their meaning (e.g.
  `d.i.m.m.` → _da in mano medici_ / "in handen van de arts"), plus markers and
  dose units
- Context-aware completions: section markers at line start, dose units right
  after a number, and abbreviations scoped to the `R/`/`Da/`/`S/` section the
  cursor sits in
- Markdown diagnostic messages for clients that advertise
  `textDocument.diagnostic.markupMessageSupport` (plain strings otherwise)
- Semantic tokens, folding ranges, and selection ranges

## Library

The default entrypoint is runtime-agnostic: `getRecipeAnalyzer()` detects
browser vs Node/Deno and lazily loads the matching analyzer.

```ts
import { getRecipeAnalyzer } from "recipe-lsp";

const analyzer = await getRecipeAnalyzer();
const analysis = analyzer.analyzeRecipe(
  "R/ amoxicilline 500 mg\nS/ 3 dd 1 tablet",
);

console.log(analysis.diagnostics, analysis.symbols);
```

To run a full language server, wire an analyzer to a connection with
`startRecipeServer`; to drive the parser against a `Parser` you configured
yourself, use `createRecipeAnalyzer`.

## CLI

The Node server needs exactly one transport flag:

```bash
recipe-lsp --stdio
recipe-lsp --node-ipc
recipe-lsp --socket=3000
recipe-lsp --help
```

Argument parsing, help, and friendly errors are handled by
[`@kjanat/dreamcli`][dreamcli]; running the binary with no transport, more than
one, or an unknown flag prints a short message instead of a stack trace. This
path requires **Node ≥ 22.22.2** (dreamcli's floor).

## Browser worker

`recipe-lsp/browser` is a self-contained module Web Worker: every dependency is
bundled in, and the two wasm grammars ship next to `dist/browser.js` and are
loaded relative to the bundle's own URL. So it runs from a bare `new Worker(url)`
with no import map, bundler, or dependency resolution.

Load it from a CDN that serves the package files flat (so the sibling `.wasm`
assets resolve), e.g. jsDelivr:

```ts
new Worker("https://cdn.jsdelivr.net/npm/recipe-lsp/dist/browser.js", {
  type: "module",
});
```

The worker speaks LSP over the worker message channel (`postMessage` the
JSON-RPC `initialize`, then `textDocument/didOpen`, …).

> A re-exporting CDN that relocates modules into a transformed subpath (e.g.
> `esm.sh/recipe-lsp/browser`) breaks the sibling-relative wasm URLs — use a
> flat file CDN, or import the worker through your own bundler.

## Notes

- The server reparses the whole document on change. Recipe files are tiny;
  simple wins.
- Tree-sitter reports positions in UTF-8 bytes; `recipe-lsp` converts them to
  LSP UTF-16 positions so diagnostics and hovers stay correct on accented text.
- Analysis code is runtime-agnostic; only `server.ts` and
  `src/runtime/node-analyzer.ts` are Node-specific.

[npm]: https://npm.im/recipe-lsp
[jsr]: https://jsr.io/@kjanat/recipe-lsp
[dreamcli]: https://jsr.io/@kjanat/dreamcli
