# recipe-lsp

## OVERVIEW

This package is the Language Server Protocol server for Recipe. It consumes
`tree-sitter-recipe` as the syntax source of truth and layers editor-facing
diagnostics, hover text, symbols, and completions on top.

## WHERE TO LOOK

| Task                   | Location               | Notes                                                    |
| ---------------------- | ---------------------- | -------------------------------------------------------- |
| LSP wiring             | `server.ts`            | Capabilities, document lifecycle, stdio transport        |
| Parsing + diagnostics  | `src/analysis.ts`      | Tree-sitter parse, syntax errors, section-order warnings |
| Hover/completion vocab | `src/vocabulary.ts`    | Marker, abbreviation, and unit metadata                  |
| Behavior tests         | `src/analysis.test.ts` | Unicode offsets, diagnostics, symbols, hover             |

## SOURCE OF TRUTH

- Grammar semantics live in `tree-sitter-recipe`.
- This package must not invent parallel abbreviation or unit lists.
- Tree-sitter byte positions must always be converted before sending LSP ranges.

## COMMANDS

```bash
bun install
bun run build
bun run typecheck
bun test
bun run dev
node ./dist/server.mjs --stdio
```

## ANTI-PATTERNS

- Do not add regex-only parsing for syntax already owned by tree-sitter.
- Do not map tree-sitter byte columns directly to LSP character offsets.
- Do not add completion vocab here that is absent upstream.
- Do not reintroduce Bun-only runtime assumptions; shipping target is Node.
