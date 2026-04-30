// biome-ignore-all lint/correctness/noNodejsModules: node ...
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Language, Parser } from "web-tree-sitter";

import { createRecipeAnalyzer, type RecipeAnalyzer } from "./analysis.ts";

const runtimeWasmPath = fileURLToPath(
	new URL("../node_modules/web-tree-sitter/web-tree-sitter.wasm", import.meta.url),
);
const recipeWasmUrl = new URL(
	"../node_modules/tree-sitter-recipe/tree-sitter-recipe.wasm",
	import.meta.url,
);

async function createNodeRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	await Parser.init({
		locateFile(scriptName: string): string {
			if (
				scriptName === "tree-sitter.wasm"
				|| scriptName === "web-tree-sitter.wasm"
			) {
				return runtimeWasmPath;
			}

			return scriptName;
		},
	});

	const parser = new Parser();
	const language = await Language.load(new Uint8Array(await readFile(recipeWasmUrl)));
	parser.setLanguage(language);
	return createRecipeAnalyzer(parser);
}

let analyzerPromise: Promise<RecipeAnalyzer> | undefined;

export function getNodeRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	analyzerPromise ??= createNodeRecipeAnalyzer();
	return analyzerPromise;
}
