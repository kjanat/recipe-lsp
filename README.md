# recipe-lsp

`recipe-lsp` is a Node-compatible Language Server Protocol server for the Recipe
pharmacological notation language.

## Features

- Tree-sitter-backed syntax diagnostics
- Lightweight section-order warnings (`R/` -> `Da/` -> `S/`)
- Document symbols for recipe sections
- Hover help for markers, units, and Latin abbreviations
- Static completions for markers, common directives, abbreviations, and units

## Local dev

In this monorepo, local parser linking still uses Bun because
`tree-sitter-recipe` is a sibling package:

```bash
cd ../tree-sitter-recipe && bun link
cd ../recipe-lsp && bun install
```

Build once, then run with Node:

```bash
bun bd
node ./dist/server.mjs --stdio
```

`bun start` also builds first via `prestart`.

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
