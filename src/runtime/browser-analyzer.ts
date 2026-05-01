import { Language, Parser } from "web-tree-sitter";

import { createRecipeAnalyzer, type RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

const runtimeWasmUrl = new URL("../../dist/tree-sitter.wasm", import.meta.url).toString();
const recipeWasmAsset = new URL("../../dist/tree-sitter-recipe.wasm", import.meta.url);

type BrowserLanguage = Awaited<ReturnType<typeof Language.load>>;
const isNodeRuntime = typeof process !== "undefined" && typeof process.versions?.node === "string";

interface BrowserAnalyzerBootstrap<LanguageType, AnalyzerType> {
	initRuntime: (locateFile: (scriptName: string) => string) => Promise<void>;
	loadLanguage: (url: string) => Promise<LanguageType>;
	createAnalyzer: (language: LanguageType) => AnalyzerType;
}

const browserAnalyzerBootstrap: BrowserAnalyzerBootstrap<BrowserLanguage, RecipeAnalyzer> = {
	initRuntime: (locateFile: (scriptName: string) => string) => Parser.init({ locateFile }),
	loadLanguage: (url: string) => Language.load(url),
	createAnalyzer: (language: BrowserLanguage) => {
		const parser = new Parser();
		parser.setLanguage(language);
		return createRecipeAnalyzer(parser);
	},
};

export async function createBrowserRecipeAnalyzerWith<LanguageType, AnalyzerType>(
	bootstrap: BrowserAnalyzerBootstrap<LanguageType, AnalyzerType>,
): Promise<AnalyzerType> {
	await bootstrap.initRuntime((scriptName: string): string => {
		if (
			scriptName === "tree-sitter.wasm"
			|| scriptName === "web-tree-sitter.wasm"
		) {
			return runtimeWasmUrl;
		}

		return scriptName;
	});

	const language = await bootstrap.loadLanguage(
		isNodeRuntime ? recipeWasmAsset.pathname : recipeWasmAsset.toString(),
	);
	return bootstrap.createAnalyzer(language);
}

async function createBrowserRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	return createBrowserRecipeAnalyzerWith(browserAnalyzerBootstrap);
}

let analyzerPromise: Promise<RecipeAnalyzer> | undefined;

export function getBrowserRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	analyzerPromise ??= createBrowserRecipeAnalyzer();
	return analyzerPromise;
}
