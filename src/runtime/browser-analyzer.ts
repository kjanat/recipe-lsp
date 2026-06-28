import { Language, Parser } from "web-tree-sitter";

import { createRecipeAnalyzer, type RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

// Resolve the wasm assets ourselves at runtime — portable across Deno/JSR,
// Node, and any bundler — instead of the bundler-only `?url` import sugar that
// JSR can't follow. The browser build rewrites these to emitted assets.
const recipeWasmUrl = import.meta.resolve("tree-sitter-recipe/tree-sitter-recipe.wasm");
const runtimeWasmUrl = import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm");

type BrowserLanguage = Awaited<ReturnType<typeof Language.load>>;
type LanguageSource = Parameters<typeof Language.load>[0];

interface BrowserAnalyzerBootstrap<LanguageType, AnalyzerType, SourceType = LanguageSource> {
	initRuntime: (locateFile: (scriptName: string) => string) => Promise<void>;
	resolveLanguageSource: (url: string) => Promise<SourceType>;
	loadLanguage: (source: SourceType) => Promise<LanguageType>;
	createAnalyzer: (language: LanguageType) => AnalyzerType;
}

async function compileLanguageModule(url: string): Promise<WebAssembly.Module> {
	const response = await fetch(url);
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Language module fetch failed with status ${response.status}.\n\n${body}`);
	}

	const retryResponse = response.clone();
	try {
		return await WebAssembly.compileStreaming(response);
	} catch {
		return WebAssembly.compile(await retryResponse.arrayBuffer());
	}
}

const browserAnalyzerBootstrap: BrowserAnalyzerBootstrap<BrowserLanguage, RecipeAnalyzer, LanguageSource> = {
	initRuntime: (locateFile: (scriptName: string) => string) => Parser.init({ locateFile }),
	resolveLanguageSource: (url: string) => compileLanguageModule(url),
	loadLanguage: (source: LanguageSource) => Language.load(source),
	createAnalyzer: (language: BrowserLanguage) => {
		const parser = new Parser();
		parser.setLanguage(language);
		return createRecipeAnalyzer(parser);
	},
};

async function createBrowserRecipeAnalyzerWith<LanguageType, AnalyzerType, SourceType>(
	bootstrap: BrowserAnalyzerBootstrap<LanguageType, AnalyzerType, SourceType>,
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

	const languageSource = await bootstrap.resolveLanguageSource(recipeWasmUrl);
	const language = await bootstrap.loadLanguage(languageSource);
	return bootstrap.createAnalyzer(language);
}

let analyzerPromise: Promise<RecipeAnalyzer> | undefined;

function getBrowserRecipeAnalyzer<LanguageType, SourceType>(
	bootstrap?: BrowserAnalyzerBootstrap<LanguageType, RecipeAnalyzer, SourceType>,
): Promise<RecipeAnalyzer>;
function getBrowserRecipeAnalyzer(
	bootstrap?: BrowserAnalyzerBootstrap<BrowserLanguage, RecipeAnalyzer, LanguageSource>,
): Promise<RecipeAnalyzer> {
	const effectiveBootstrap = bootstrap ?? browserAnalyzerBootstrap;
	analyzerPromise ??= createBrowserRecipeAnalyzerWith(effectiveBootstrap);
	return analyzerPromise;
}

export { createBrowserRecipeAnalyzerWith, getBrowserRecipeAnalyzer };
