import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// biome-ignore lint/correctness/noUnresolvedImports: Biome misreads `web-tree-sitter` exports here; ts/bun/runtime agree.
import { Language, Parser } from "web-tree-sitter";

import { createRecipeAnalyzer, type RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

function resolveRuntimeWasmPath(): string {
	return fileURLToPath(import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm"));
}

function resolveRecipeWasmUrl(): Promise<URL> {
	return Promise.resolve(new URL("../tree-sitter-recipe.wasm", import.meta.resolve("tree-sitter-recipe")));
}

async function createNodeRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	const runtimeWasmPath = resolveRuntimeWasmPath();
	const recipeWasmUrl = await resolveRecipeWasmUrl();

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
