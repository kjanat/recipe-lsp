// biome-ignore-all lint/correctness/noNodejsModules: node ...
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Language, Parser } from "web-tree-sitter";

import { createRecipeAnalyzer, type RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

async function resolveInstalledUrl(candidates: readonly string[]): Promise<URL> {
	for (const candidate of candidates) {
		const url = new URL(candidate, import.meta.url);
		try {
			await access(url);
			return url;
		} catch {}
	}

	throw new Error(`Could not resolve installed asset from: ${candidates.join(", ")}`);
}

async function resolveRuntimeWasmPath(): Promise<string> {
	const url = await resolveInstalledUrl([
		"../../node_modules/web-tree-sitter/web-tree-sitter.wasm",
		"../node_modules/web-tree-sitter/web-tree-sitter.wasm",
	]);
	return fileURLToPath(url);
}

async function resolveRecipeWasmUrl(): Promise<URL> {
	return resolveInstalledUrl([
		"../../node_modules/tree-sitter-recipe/tree-sitter-recipe.wasm",
		"../node_modules/tree-sitter-recipe/tree-sitter-recipe.wasm",
	]);
}

async function createNodeRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	const runtimeWasmPath = await resolveRuntimeWasmPath();
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
