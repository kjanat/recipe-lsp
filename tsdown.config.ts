import { wasm } from "rolldown-plugin-wasm";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

// import { resolveBrowserWasmMetaResolve } from "#plugins/rewrite-browser-wasm-meta-resolve";
// export const PACKAGE_WASM_SPECIFIERS = [
// 	"tree-sitter-recipe/tree-sitter-recipe.wasm",
// 	"web-tree-sitter/web-tree-sitter.wasm",
// ] as const;
// resolveBrowserWasmMetaResolve({
// 	specifiers: PACKAGE_WASM_SPECIFIERS,
// 	include: /\/src\/runtime\/browser-analyzer\.ts$/u,
// }),

const cfg: UserConfig[] = defineConfig([{
	plugins: [wasm({ fileName: "[name][extname]", maxFileSize: 0 })],
	entry: [{ index: "./mod.ts", server: "./server.ts", browser: "./browser.ts" }],
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
	exports: {
		bin: "./server.ts",
		exclude: ["server"],
		packageJson: true,
	},
	onSuccess: "npm pkg fix",
	inputOptions: { resolve: { mainFields: ["browser", "worker", "module", "main"] } },
}]);

export default cfg;
