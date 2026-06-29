import { wasm } from "rolldown-plugin-wasm";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

import { resolveBrowserWasmMetaResolve } from "#plugins/rewrite-browser-wasm-meta-resolve";
import { stubBareModules } from "#plugins/stub-bare-modules";

/** Wasm assets the browser analyzer resolves at runtime via `import.meta.resolve`. */
const PACKAGE_WASM_SPECIFIERS = [
	"tree-sitter-recipe/tree-sitter-recipe.wasm",
	"web-tree-sitter/web-tree-sitter.wasm",
] as const;

/** Node built-ins `web-tree-sitter` references from browser-dead branches. */
const BROWSER_DEAD_NODE_BUILTINS = ["fs/promises", "module"] as const;

const wasmAssets = () => wasm({ fileName: "[name][extname]", maxFileSize: 0 });

const cfg: UserConfig[] = defineConfig([
	// Library + Node bin: deps stay external so consumers dedupe from node_modules,
	// and `index.js` keeps the runtime-agnostic `import.meta.resolve` wasm lookup.
	{
		plugins: [wasmAssets()],
		entry: { index: "./mod.ts", server: "./server.ts" },
		dts: { enabled: true, entry: ["*", "!server.ts", "!browser.ts"] },
		format: ["esm"],
		target: "esnext",
		platform: "neutral",
		treeshake: false,
		hash: false,
		sourcemap: false,
		minify: true,
		clean: true,
		publint: true,
		unused: true,
		attw: { profile: "esm-only", excludeEntrypoints: ["browser", "server"] },
		deps: { neverBundle: [/^node:/u, "tree-sitter-recipe", "web-tree-sitter"] },
		onSuccess: "npm pkg fix",
		inputOptions: { resolve: { mainFields: ["browser", "worker", "module", "main"] } },
	},
	// Browser Web Worker: self-contained for a bare-CDN `new Worker(url)`. Bundle every
	// dependency in (no CDN re-export resolution), and rewrite the two wasm
	// `import.meta.resolve` calls into emitted assets referenced relative to
	// `import.meta.url` (no import map required at runtime).
	{
		plugins: [
			stubBareModules(BROWSER_DEAD_NODE_BUILTINS),
			resolveBrowserWasmMetaResolve({
				specifiers: PACKAGE_WASM_SPECIFIERS,
				include: /\/src\/runtime\/browser-analyzer\.ts$/u,
			}),
			wasmAssets(),
		],
		entry: { browser: "./browser.ts" },
		// Emit `browser.d.ts` so JSR accepts the built `./browser` entry (no slow-types
		// JavaScript-entrypoint warning); the worker module itself exports nothing.
		dts: true,
		format: ["esm"],
		target: "esnext",
		platform: "browser",
		treeshake: true,
		hash: false,
		sourcemap: false,
		minify: true,
		clean: false,
		// One file: inline the (dead-branch) stub chunks so `browser.js` has no sibling
		// JS to chase — a single `new Worker(url)` artifact alongside its wasm.
		outputOptions: { inlineDynamicImports: true },
		// Point the built worker at its declaration so JSR fast-checks it without
		// inferring types from the bundle (no JavaScript-entrypoint slow-type warning).
		banner: "/* @ts-self-types=\"./browser.d.ts\" */",
		deps: {
			// Inline the whole language-server family (incl. subpaths like `/browser`
			// and the transitive protocol/jsonrpc) plus the tree-sitter packages, so
			// the worker needs no CDN re-export resolution at load.
			alwaysBundle: [
				/^vscode-languageserver(\/.*)?$/u,
				/^vscode-languageserver-protocol(\/.*)?$/u,
				/^vscode-languageserver-textdocument$/u,
				/^vscode-jsonrpc(\/.*)?$/u,
				/^web-tree-sitter$/u,
				/^tree-sitter-recipe(\/.*)?$/u,
			],
			neverBundle: [/^node:/u],
		},
		inputOptions: { resolve: { mainFields: ["browser", "worker", "module", "main"] } },
	},
]);

export default cfg;
