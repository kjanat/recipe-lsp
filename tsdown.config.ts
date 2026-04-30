import { defineConfig } from "tsdown";

const config = defineConfig({
	entry: ["./server.ts"],
	outDir: "./dist",
	format: "es",
	dts: true,
	clean: true,
	treeshake: true,
	platform: "node",
	target: "esnext",
	hash: false,
	sourcemap: false,
	minify: false,
	deps: {
		neverBundle: [
			"tree-sitter-recipe",
			"vscode-languageserver",
			"vscode-languageserver-textdocument",
			"web-tree-sitter",
		],
	},
});

// biome-ignore lint/style/noDefaultExport: tsdown expects a default export
export default config;
