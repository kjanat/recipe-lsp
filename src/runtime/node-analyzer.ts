import type { RecipeAnalyzer } from "#anal/recipe-analyzer.ts";
import { createRecipeAnalyzer } from "#anal/recipe-analyzer.ts";

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Language, Parser } from "web-tree-sitter";

function resolveRuntimeWasmPath(): string {
	return fileURLToPath(import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm"));
}

function resolveRecipeWasmUrl(): Promise<URL> {
	return Promise.resolve(new URL(import.meta.resolve("tree-sitter-recipe/tree-sitter-recipe.wasm")));
}

async function createNodeRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	const runtimeWasmPath = resolveRuntimeWasmPath();
	const recipeWasmLocation = await resolveRecipeWasmUrl();

	await Parser.init({
		/* dprint-ignore */
		locateFile(scriptName: string, matchesKnown = scriptName === "tree-sitter.wasm" || scriptName === "web-tree-sitter.wasm"): string {
			return matchesKnown ? runtimeWasmPath : scriptName;
		},
	});

	const parser = new Parser();
	const language = await Language.load(new Uint8Array(await readFile(recipeWasmLocation)));
	parser.setLanguage(language);
	return createRecipeAnalyzer(parser);
}

let analyzerPromise: Promise<RecipeAnalyzer> | undefined;

export function getNodeRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	analyzerPromise ??= createNodeRecipeAnalyzer();
	return analyzerPromise;
}
