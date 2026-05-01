import { describe, expect, test } from "bun:test";

const stubLocateFiles: string[] = [];
const stubLanguageLoads: unknown[] = [];

const stubLanguagesSeenByAnalyzer: unknown[] = [];

function loadBrowserAnalyzerModule(): Promise<typeof import("#runtime/browser-analyzer.ts")> {
	return import("#runtime/browser-analyzer.ts");
}

describe("browser analyzer factory", () => {
	test("constructs an analyzer using URL-based wasm loading", async () => {
		const { createBrowserRecipeAnalyzerWith } = await loadBrowserAnalyzerModule();

		const analyzer = await createBrowserRecipeAnalyzerWith({
			initRuntime: (locateFile: (scriptName: string) => string): Promise<void> => {
				stubLocateFiles.push(locateFile("tree-sitter.wasm"));
				stubLocateFiles.push(locateFile("web-tree-sitter.wasm"));
				stubLocateFiles.push(locateFile("other.wasm"));
				return Promise.resolve();
			},
			loadLanguage: (input: string): Promise<{ stub: true }> => {
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
					}),
					hoverForPosition: () => null,
					completionItems: () => [],
				};
			},
		});
		expect(typeof analyzer.analyzeRecipe).toBe("function");
		expect(typeof analyzer.hoverForPosition).toBe("function");
		expect(typeof analyzer.completionItems).toBe("function");

		expect(stubLocateFiles.some((entry) => entry.endsWith("tree-sitter.wasm"))).toBe(true);
		expect(stubLocateFiles.some((entry) => entry === "other.wasm")).toBe(true);
		expect(stubLanguageLoads.length).toBeGreaterThan(0);
		expect(typeof stubLanguageLoads[0]).toBe("string");
		expect(stubLanguagesSeenByAnalyzer).toHaveLength(1);
	});

	test("memoizes the analyzer across calls", async () => {
		const { getBrowserRecipeAnalyzer } = await loadBrowserAnalyzerModule();
		const a = await getBrowserRecipeAnalyzer();
		const b = await getBrowserRecipeAnalyzer();
		expect(a).toBe(b);
	});
});
