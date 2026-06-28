# recipe-lsp

[![NPM](https://img.shields.io/npm/v/recipe-lsp?logo=npm&labelColor=CB3837&color=black)][npm]
[![JSR](https://img.shields.io/jsr/v/@kjanat/recipe-lsp?logoColor=083344&logo=jsr&logoSize=auto&label=&labelColor=f7df1e&color=black)][jsr]

A Language Server Protocol implementation for the **Recipe** (`.recipe`)
pharmacological-notation language. Published to [npm][npm] (`recipe-lsp`) and
[JSR][jsr] (`@kjanat/recipe-lsp`), with three entrypoints:

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

`recipe-lsp/browser` is a module Web Worker that wires the `fetch`-backed
analyzer to a worker message channel. The wasm grammars are resolved at runtime
via `import.meta.resolve` — **no wasm is bundled into `dist/`**, so any consumer
(bundler, Deno, or a CDN) supplies them from the package.

Served straight from a CDN that does package resolution (the URL is absolute, so
no bundler is required):

```ts
new Worker("https://esm.sh/recipe-lsp/browser", { type: "module" });
```

Inside a bundler (Vite/webpack/esbuild), import the worker the bundler's way; it
will resolve the package export and emit the wasm as assets.

## Local dev

`tree-sitter-recipe` is a published dependency, so a plain install pulls the
grammar (and its wasm) from the registry:

```bash
bun install
```

To develop against an unpublished local grammar, link the sibling checkout:

```bash
cd ../tree-sitter-recipe && bun link
cd ../recipe-lsp && bun link tree-sitter-recipe
```

Common scripts:

```bash
bun lsp      # run the server from source over stdio (bun server.ts --stdio)
bun bd       # build to dist/ via tsdown
bun start    # build, then run dist/server.js --stdio
bun test     # run the test suite
```

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
