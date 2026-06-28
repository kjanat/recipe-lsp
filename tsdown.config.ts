import { resolveBrowserWasmMetaResolve } from "#plugins/rewrite-browser-wasm-meta-resolve";
import { wasm } from "rolldown-plugin-wasm";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

export const PACKAGE_WASM_SPECIFIERS = [
	"tree-sitter-recipe/tree-sitter-recipe.wasm",
	"web-tree-sitter/web-tree-sitter.wasm",
] as const;

const shared = {
	format: "es",
	dts: true,
	treeshake: true,
	target: "esnext",
	hash: false,
	sourcemap: false,
	minify: "dce-only",
	clean: true,
	plugins: [wasm({ fileName: "[name][extname]", maxFileSize: 0 })],
	attw: { profile: "esm-only" },
	publint: true,
	unused: true,
} as const satisfies UserConfig;

export default defineConfig([{
	...shared,
	entry: "./mod.ts",
	platform: "neutral",
	deps: { neverBundle: [/^node:/u] },
}, {
	...shared,
	entry: "./server.ts",
	platform: "node",
}, {
	...shared,
	entry: "./browser.ts",
	platform: "browser",
	minify: true,
	plugins: [
		resolveBrowserWasmMetaResolve({
			specifiers: PACKAGE_WASM_SPECIFIERS,
			include: /\/src\/runtime\/browser-analyzer\.ts$/u,
		}),
		wasm({ fileName: "[name][extname]", maxFileSize: 0 }),
	],
}]);
