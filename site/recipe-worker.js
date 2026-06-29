// Same-origin module worker that pulls the recipe-lsp browser language server
// straight from jsDelivr at runtime — no bundling, no vendoring.
//
// Why a loader instead of `new Worker(cdnUrl)`? Chrome refuses a cross-origin
// top-level worker script (SecurityError), even with CORS. This file is served
// same-origin (GitHub Pages), and a *dynamic import* of the CDN module is a
// plain CORS fetch, which is allowed. The imported bundle wires its LSP
// connection to THIS worker's `self`, so the page talks to it normally.
//
// A flat-file CDN (jsDelivr) is required: it serves `dist/browser.js` next to
// its `*.wasm` siblings, so the bundle's `new URL("…wasm", import.meta.url)`
// resolves. A re-exporting CDN (esm.sh) relocates the module and breaks that.
import "https://cdn.jsdelivr.net/npm/recipe-lsp@0.2.2/dist/browser.js";
