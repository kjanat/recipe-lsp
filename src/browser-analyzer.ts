import { Language, Parser } from "web-tree-sitter";

import { createRecipeAnalyzer, type RecipeAnalyzer } from "./analysis.ts";

const runtimeWasmUrl = new URL("./tree-sitter.wasm", import.meta.url).toString();
const recipeWasmUrl = new URL("./tree-sitter-recipe.wasm", import.meta.url).toString();

async function createBrowserRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	await Parser.init({
		locateFile(scriptName: string): string {
			if (
				scriptName === "tree-sitter.wasm"
				|| scriptName === "web-tree-sitter.wasm"
			) {
				return runtimeWasmUrl;
			}

			return scriptName;
		},
	});

	const parser = new Parser();
	const language = await Language.load(recipeWasmUrl);
	parser.setLanguage(language);
	return createRecipeAnalyzer(parser);
}

let analyzerPromise: Promise<RecipeAnalyzer> | undefined;

export function getBrowserRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	analyzerPromise ??= createBrowserRecipeAnalyzer();
	return analyzerPromise;
}
