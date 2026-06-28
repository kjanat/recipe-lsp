import type { RecipeAnalyzer } from "#anal/recipe-analyzer.ts";
import { createRecipeAnalyzer } from "#anal/recipe-analyzer.ts";

import { Language, Parser } from "web-tree-sitter";

/**
 * Resolve the wasm assets ourselves at runtime.
 *
 * Portable across Deno/JSR, Node, and any bundler, instead of the bundler-only
 * `?url` import sugar that JSR can't follow.
 *
 * The browser build rewrites these to emitted assets.
 */
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

/**
 * Fetch the grammar as raw bytes and let `Language.load` compile them.
 *
 * We pass a `Uint8Array` (accepted by every released web-tree-sitter) rather than a
 * precompiled `WebAssembly.Module` — that needs `Language.loadSync`, which is on
 * upstream master but not yet in a release.
 *
 * TODO(#1): switch to a precompiled module + `Language.loadSync(module)` (restoring
 * streaming compilation) once web-tree-sitter ships `loadSync` in a release.
 */
async function fetchLanguageBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Language wasm fetch failed with status ${response.status}.\n\n${body}`);
	}

	return new Uint8Array(await response.arrayBuffer());
}

const browserAnalyzerBootstrap: BrowserAnalyzerBootstrap<BrowserLanguage, RecipeAnalyzer, LanguageSource> = {
	initRuntime: (locateFile: (scriptName: string) => string) => Parser.init({ locateFile }),
	resolveLanguageSource: (url: string) => fetchLanguageBytes(url),
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
	await bootstrap.initRuntime(
		(
			scriptName: string,
			matchesKnown = scriptName === "tree-sitter.wasm" || scriptName === "web-tree-sitter.wasm",
		): string => {
			return matchesKnown ? runtimeWasmUrl : scriptName;
		},
	);

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
