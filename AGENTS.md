# recipe-lsp

## OVERVIEW

This package is the Language Server Protocol server for Recipe. It consumes
`tree-sitter-recipe` as the syntax source of truth and layers editor-facing
diagnostics, hover text, symbols, and completions on top.

## WHERE TO LOOK

| Task                   | Location                                 | Notes                                                  |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Node LSP entry         | `server.ts`                              | stdio transport                                        |
| Browser LSP entry      | `browser.ts`                             | worker transport                                       |
| Shared LSP wiring      | `src/server/lsp-server.ts`               | document lifecycle and request handlers                |
| Parsing orchestration  | `src/analysis/recipe-analyzer.ts`        | parser-backed analysis facade                          |
| Node parser runtime    | `src/runtime/node-analyzer.ts`           | loads wasm from installed dependencies                 |
| Browser parser runtime | `src/runtime/browser-analyzer.ts`        | loads wasm from sibling worker assets                  |
| Diagnostics + symbols  | `src/analysis/diagnostics.ts`            | syntax errors, section-order warnings, outline symbols |
| UTF-8/LSP coords       | `src/analysis/lsp-positions.ts`          | tree-sitter byte offsets -> LSP UTF-16                 |
| Hover/completion vocab | `src/vocabulary/*.ts`                    | marker, abbreviation, and unit metadata                |
| Behavior tests         | `tests/analysis/recipe-analyzer.test.ts` | Unicode offsets, diagnostics, symbols, hover           |

## SOURCE OF TRUTH

- Grammar semantics live in `tree-sitter-recipe`.
- This package must not invent parallel abbreviation or unit lists.
- Tree-sitter byte positions must always be converted before sending LSP ranges.
- Browser worker build depends on emitted wasm assets living next to
  `dist/browser.js`, currently `dist/web-tree-sitter.wasm` and
  `dist/tree-sitter-recipe.wasm`.

## COMMANDS

```bash
bun install
bun run build
bun run typecheck
bun test
bun run dev
node ./dist/server.mjs --stdio
dist/browser.js via Worker
```

## ANTI-PATTERNS

- Do not add regex-only parsing for syntax already owned by tree-sitter.
- Do not map tree-sitter byte columns directly to LSP character offsets.
- Do not add completion vocab here that is absent upstream.
- Do not reintroduce Bun-only runtime assumptions; shipping target is Node.
- Do not import `vscode-languageserver/node` anywhere shared with the browser
  build.
