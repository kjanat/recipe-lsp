# recipe-lsp

`recipe-lsp` is a Bun-first Language Server Protocol server for the Recipe
pharmacological notation language.

## Features

- Tree-sitter-backed syntax diagnostics
- Lightweight section-order warnings (`R/` -> `Da/` -> `S/`)
- Document symbols for recipe sections
- Hover help for markers, units, and Latin abbreviations
- Static completions for markers, common directives, abbreviations, and units

## Local dev

```bash
cd ../tree-sitter-recipe && bun link
cd ../recipe-lsp && bun install
```

Start the server over stdio:

```bash
bun run server.ts --stdio
```

## Notes

- The server reparses the whole document on change.
  Recipe files are tiny; simple wins.
- Tree-sitter reports positions in UTF-8 bytes. `recipe-lsp` converts them to
  LSP UTF-16 positions so diagnostics and hovers stay correct on accented text.
