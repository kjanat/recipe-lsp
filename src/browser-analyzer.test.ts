import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { RecipeAnalyzer } from "./analysis.ts";

interface FakeNode {
	type: string;
	text: string;
	startPosition: { row: number; column: number };
	endPosition: { row: number; column: number };
	namedChildren: FakeNode[];
	children: FakeNode[];
	firstNamedChild: FakeNode | null;
	parent: FakeNode | null;
	isMissing: boolean;
	isError: boolean;
	namedDescendantForPosition: () => FakeNode;
}

interface FakeTree {
	rootNode: FakeNode;
}

const stubLocateFiles: string[] = [];
const stubLanguageLoads: unknown[] = [];
const stubLanguagesSetOnParser: unknown[] = [];

function createFakeNode(): FakeNode {
	const node: FakeNode = {
		type: "recipe",
		text: "",
		startPosition: { row: 0, column: 0 },
		endPosition: { row: 0, column: 0 },
		namedChildren: [],
		children: [],
		firstNamedChild: null,
		parent: null,
		isMissing: false,
		isError: false,
		namedDescendantForPosition: (): FakeNode => node,
	};
	return node;
}

class FakeParser {
	static init(options: { locateFile?: (n: string) => string }): Promise<void> {
		if (options.locateFile) {
			stubLocateFiles.push(options.locateFile("tree-sitter.wasm"));
			stubLocateFiles.push(options.locateFile("web-tree-sitter.wasm"));
			stubLocateFiles.push(options.locateFile("other.wasm"));
		}
		return Promise.resolve();
	}
	setLanguage(language: unknown): void {
		stubLanguagesSetOnParser.push(language);
	}
	parse(_text: string): FakeTree {
		return { rootNode: createFakeNode() };
	}
}

const fakeLanguageModule = {
	load: (input: unknown): Promise<{ stub: true }> => {
		stubLanguageLoads.push(input);
		return Promise.resolve({ stub: true });
	},
};

const stubModuleExports = Object.fromEntries([
	["Parser", FakeParser],
	["Language", fakeLanguageModule],
]);

beforeAll(() => {
	mock.module("web-tree-sitter", () => stubModuleExports);
});

describe("getBrowserRecipeAnalyzer", () => {
	test("constructs an analyzer using URL-based wasm loading", async () => {
		const { getBrowserRecipeAnalyzer } = await import("./browser-analyzer.ts");

		const analyzer: RecipeAnalyzer = await getBrowserRecipeAnalyzer();
		expect(typeof analyzer.analyzeRecipe).toBe("function");
		expect(typeof analyzer.hoverForPosition).toBe("function");
		expect(typeof analyzer.completionItems).toBe("function");

		expect(stubLocateFiles.some((entry) => entry.endsWith("tree-sitter.wasm"))).toBe(true);
		expect(stubLocateFiles.some((entry) => entry === "other.wasm")).toBe(true);
		expect(stubLanguageLoads.length).toBeGreaterThan(0);
		expect(typeof stubLanguageLoads[0]).toBe("string");
		expect(stubLanguagesSetOnParser).toHaveLength(1);
	});

	test("memoizes the analyzer across calls", async () => {
		const { getBrowserRecipeAnalyzer } = await import("./browser-analyzer.ts");
		const a = await getBrowserRecipeAnalyzer();
		const b = await getBrowserRecipeAnalyzer();
		expect(a).toBe(b);
	});
});
