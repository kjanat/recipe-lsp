# recipe-lsp browser demo

A zero-backend demo of [`recipe-lsp`](../README.md): the language server is
compiled to WebAssembly and runs in a Web Worker, **imported live from jsDelivr**
at page load — nothing is bundled or vendored here.

It's plain static files; deployed to GitHub Pages by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml).

## How it works

- `recipe-worker.js` is a same-origin module worker that does
  `import "https://cdn.jsdelivr.net/npm/recipe-lsp@<version>/dist/browser.js"`.
  A cross-origin `new Worker(cdnUrl)` is blocked by browsers; a dynamic import
  of the CDN module from a same-origin worker is not.
- `app.js` speaks LSP (`initialize` → `didOpen`/`didChange`) over the worker's
  message channel and renders the pushed diagnostics + document symbols.
- A **flat-file** CDN is required so the bundle's sibling `*.wasm` URLs resolve;
  a re-exporting CDN (esm.sh) relocates the module and breaks them.

## Run locally

Any static file server works. With Deno:

```bash
deno run --allow-net --allow-read jsr:@std/http/file-server site
```
