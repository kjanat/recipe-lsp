// biome-ignore-all lint/correctness/noNodejsModules: tsdown ...
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsdown";

const runtimeWasmPath = fileURLToPath(
	import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm"),
);
const recipeWasmPath = fileURLToPath(
	new URL(
		"./tree-sitter-recipe.wasm",
		import.meta.resolve("tree-sitter-recipe/package.json"),
	),
);

function copyWasmArtifacts(): void {
	const targets = [
		{ from: runtimeWasmPath, to: "./dist/tree-sitter.wasm" },
		{ from: recipeWasmPath, to: "./dist/tree-sitter-recipe.wasm" },
	] as const;

	for (const target of targets) {
		mkdirSync(dirname(target.to), { recursive: true });
		copyFileSync(target.from, target.to);
	}
}

const NEVER_BUNDLE: Array<string | RegExp> = [
	"tree-sitter-recipe",
	"vscode-languageserver-textdocument",
	"web-tree-sitter",
	/^vscode-languageserver/u,
];

const shared = {
	format: "es",
	dts: true,
	treeshake: true,
	target: "esnext",
	hash: false,
	sourcemap: false,
	minify: false,
	deps: {
		neverBundle: NEVER_BUNDLE,
	},
	hooks: {
		"build:done": () => {
			copyWasmArtifacts();
		},
	},
} as const;

const config = defineConfig([
	{
		entry: "./server.ts",
		outDir: "./dist",
		clean: true,
		platform: "node",
		...shared,
	},
	{
		entry: "./browser.ts",
		outDir: "./dist",
		clean: false,
		platform: "browser",
		...shared,
	},
]);

// biome-ignore lint/style/noDefaultExport: tsdown expects a default export
export default config;
