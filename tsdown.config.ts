import { wasm } from "rolldown-plugin-wasm";
import type { DepsConfig, UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const neverBundle: DepsConfig["neverBundle"] = [
	"tree-sitter-recipe",
	"vscode-languageserver-textdocument",
	"web-tree-sitter",
	/^vscode-languageserver/u,
];

const browserAlwaysBundle: DepsConfig["alwaysBundle"] = [
	"tree-sitter-recipe/tree-sitter-recipe.wasm?url",
	"web-tree-sitter/web-tree-sitter.wasm?url",
];

const shared: UserConfig = {
	format: "es",
	dts: false,
	treeshake: true,
	target: "esnext",
	hash: false,
	sourcemap: false,
	minify: "dce-only",
	clean: true,
	plugins: [wasm({ fileName: "[name][extname]", maxFileSize: 0 })],
	deps: { neverBundle },
} as const;

const config = defineConfig([
	{
		entry: "./server.ts",
		platform: "node",
		...shared,
	},
	{
		entry: "./browser.ts",
		platform: "browser",
		...shared,
		deps: { neverBundle, alwaysBundle: browserAlwaysBundle },
	},
]);

// biome-ignore lint/style/noDefaultExport: tsdown expects a default export
export default config;
