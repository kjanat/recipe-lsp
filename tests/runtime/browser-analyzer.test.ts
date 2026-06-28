import { describe, expect, test } from "bun:test";

import type { RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

const stubLocateFiles: string[] = [];
const stubLanguageLoads: unknown[] = [];

const stubLanguagesSeenByAnalyzer: unknown[] = [];
const WASM_MAGIC = [0, 97, 115, 109] as const;
const WASM_VERSION = [1, 0, 0, 0] as const;
const MINIMAL_WASM = Uint8Array.from([...WASM_MAGIC, ...WASM_VERSION]);

interface MemoizedAnalyzerBootstrap {
	initRuntime: () => Promise<void>;
	resolveLanguageSource: () => Promise<WebAssembly.Module>;
	loadLanguage: () => Promise<{ language: true }>;
	createAnalyzer: () => RecipeAnalyzer;
}

function loadBrowserAnalyzerModule(): Promise<typeof import("#runtime/browser-analyzer.ts")> {
	return import("#runtime/browser-analyzer.ts");
}

function compileEmptyModule(): Promise<WebAssembly.Module> {
	return WebAssembly.compile(MINIMAL_WASM);
}

function createMemoizedAnalyzerBootstrap(compiledModule: WebAssembly.Module): MemoizedAnalyzerBootstrap {
	return {
		initRuntime: (): Promise<void> => Promise.resolve(),
		resolveLanguageSource: (): Promise<WebAssembly.Module> => Promise.resolve(compiledModule),
		loadLanguage: (): Promise<{ language: true }> => Promise.resolve({ language: true }),
		createAnalyzer: (): RecipeAnalyzer => ({
			analyzeRecipe: (): never => {
				throw new Error("unused in memoization test");
			},
			hoverForPosition: (): null => null,
			completionItems: (): never[] => [],
			completionsAt: (): never[] => [],
			selectionRanges: (): never[] => [],
			semanticTokenLegend: (): readonly string[] => [],
		}),
	};
}

describe("browser analyzer factory", () => {
	test("constructs an analyzer using URL-based wasm loading", async () => {
		const { createBrowserRecipeAnalyzerWith } = await loadBrowserAnalyzerModule();
		const compiledModule = await compileEmptyModule();

		const analyzer = await createBrowserRecipeAnalyzerWith({
			initRuntime: (locateFile: (scriptName: string) => string): Promise<void> => {
				stubLocateFiles.push(locateFile("tree-sitter.wasm"));
				stubLocateFiles.push(locateFile("web-tree-sitter.wasm"));
				stubLocateFiles.push(locateFile("other.wasm"));
				return Promise.resolve();
			},
			resolveLanguageSource: (input: string): Promise<WebAssembly.Module> => {
				stubLanguageLoads.push(input);
				return Promise.resolve(compiledModule);
			},
			loadLanguage: (
				input: string | Uint8Array | WebAssembly.Module,
			): Promise<{ stub: true }> => {
				stubLanguageLoads.push(input);
				return Promise.resolve({ stub: true });
			},
			createAnalyzer: (language: { stub: true }) => {
				stubLanguagesSeenByAnalyzer.push(language);
				return {
					analyzeRecipe: () => ({
						text: "",
						lines: [],
						tree: { rootNode: { namedDescendantForPosition: () => null } },
						diagnostics: [],
						symbols: [],
						foldingRanges: [],
						semanticTokens: [],
					}),
					hoverForPosition: () => null,
					completionItems: () => [],
					selectionRanges: () => [],
					semanticTokenLegend: () => [],
				};
			},
		});
		expect(typeof analyzer.analyzeRecipe).toBe("function");
		expect(typeof analyzer.hoverForPosition).toBe("function");
		expect(typeof analyzer.completionItems).toBe("function");

		expect(stubLocateFiles.some((entry) => entry.endsWith("tree-sitter.wasm"))).toBe(true);
		expect(stubLocateFiles.some((entry) => entry === "other.wasm")).toBe(true);
		expect(stubLanguageLoads.length).toBeGreaterThan(1);
		expect(typeof stubLanguageLoads[0]).toBe("string");
		expect(typeof stubLanguageLoads[1]).toBe("object");
		expect(stubLanguagesSeenByAnalyzer).toHaveLength(1);
	});

	test("memoizes the analyzer across calls", async () => {
		const { getBrowserRecipeAnalyzer } = await loadBrowserAnalyzerModule();
		const compiledModule = await compileEmptyModule();
		const bootstrap = createMemoizedAnalyzerBootstrap(compiledModule);
		const a = await getBrowserRecipeAnalyzer(bootstrap);
		const b = await getBrowserRecipeAnalyzer(bootstrap);
		expect(a).toBe(b);
	});
});
