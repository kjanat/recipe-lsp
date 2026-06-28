import { fileURLToPath } from "node:url";

import { wasm } from "rolldown-plugin-wasm";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const PACKAGE_WASM_IMPORTS = {
	"tree-sitter-recipe/tree-sitter-recipe.wasm?url": "tree-sitter-recipe/tree-sitter-recipe.wasm",
	"web-tree-sitter/web-tree-sitter.wasm?url": "web-tree-sitter/web-tree-sitter.wasm",
} as const;

function resolveBrowserWasmPackageImports(): {
	name: string;
	transform: (code: string, id: string) => { code: string; map: null } | null;
} {
	return {
		name: "rewrite-browser-wasm-package-imports",
		transform(code: string, id: string): { code: string; map: null } | null {
			if (!id.endsWith("/src/runtime/browser-analyzer.ts")) {
				return null;
			}

			let nextCode = code;
			for (const [source, target] of Object.entries(PACKAGE_WASM_IMPORTS)) {
				nextCode = nextCode.split(source).join(`${fileURLToPath(import.meta.resolve(target))}?url`);
			}

			if (nextCode === code) {
				return null;
			}

			return { code: nextCode, map: null };
		},
	};
}

const shared: UserConfig = {
	format: "es",
	dts: false,
	treeshake: true,
	target: "esnext",
	hash: false,
	sourcemap: false,
	minify: "dce-only",
	clean: true,
} as const;

const config = defineConfig([
	{
		...shared,
		entry: "./server.ts",
		platform: "node",
		plugins: [wasm({ fileName: "[name][extname]", maxFileSize: 0 })],
	},
	{
		...shared,
		entry: "./browser.ts",
		platform: "browser",
		minify: true,
		plugins: [resolveBrowserWasmPackageImports(), wasm({ fileName: "[name][extname]", maxFileSize: 0 })],
	},
]);

// biome-ignore lint/style/noDefaultExport: tsdown expects a default export
export default config;
