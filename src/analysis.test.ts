import { describe, expect, test } from "bun:test";
import { DiagnosticSeverity } from "vscode-languageserver";

import type { RecipeAnalyzer } from "./analysis.ts";
import { getNodeRecipeAnalyzer } from "./node-analyzer.ts";

const analyzer: RecipeAnalyzer = await getNodeRecipeAnalyzer();

const TRUNCATE_TRIGGER_LENGTH = 80;
const SYMBOL_NAME_TRIGGER_REPEAT = 20;
const HOVER_LINE_OUT_OF_RANGE = 50;
const HOVER_CHARACTER_OUT_OF_RANGE = 100;

function warningMessages(analyzerInput: string): string[] {
	return analyzer
		.analyzeRecipe(analyzerInput)
		.diagnostics.filter((d) => d.severity === DiagnosticSeverity.Warning)
		.map((d) => d.message);
}

describe("analyzeRecipe", () => {
	test("returns section symbols for a valid recipe", () => {
		const analysis = analyzer.analyzeRecipe(
			"R/ claritromycin 500mg\nDa/ 14 tablets\nS/ 1 tablet b.d.d.",
		);

		expect(analysis.diagnostics).toHaveLength(0);
		expect(analysis.symbols.map((symbol) => symbol.name)).toEqual([
			"R/ claritromycin 500mg",
			"Da/ 14 tablets",
			"S/ 1 tablet b.d.d.",
		]);
	});

	test("reports stray syntax", () => {
		const analysis = analyzer.analyzeRecipe("R/ claritromycin ???");

		expect(
			analysis.diagnostics.some((diagnostic) => diagnostic.message.startsWith("Unexpected syntax")),
		).toBe(true);
	});

	test("truncates long stray syntax in diagnostic message", () => {
		const longGarbage = "?".repeat(TRUNCATE_TRIGGER_LENGTH);
		const analysis = analyzer.analyzeRecipe(`R/ amoxicilline ${longGarbage}`);
		const errorDiagnostic = analysis.diagnostics.find((d) => d.message.startsWith("Unexpected syntax"));
		if (!errorDiagnostic) {
			throw new Error("expected an unexpected-syntax diagnostic");
		}
		expect(errorDiagnostic.message).toContain("…");
	});

	test("truncates long section headlines in symbol names", () => {
		const longText = "claritromycin ".repeat(SYMBOL_NAME_TRIGGER_REPEAT).trim();
		const analysis = analyzer.analyzeRecipe(`R/ ${longText} 500mg`);
		const [rxSymbol] = analysis.symbols;
		if (!rxSymbol) {
			throw new Error("expected an rx symbol");
		}
		expect(rxSymbol.name.endsWith("…")).toBe(true);
	});

	test("reports missing tokens with humanized node type", () => {
		// `dtd` directive expects `dtd no <number>`; without the number the parser inserts a missing node.
		const analysis = analyzer.analyzeRecipe("R/ a 1mg dtd");
		const missing = analysis.diagnostics.find((d) => d.message.startsWith("Missing"));
		if (!missing) {
			throw new Error("expected a missing-token diagnostic");
		}
		expect(missing.message).toBe("Missing number");
	});
});

describe("analyzeRecipe section ordering", () => {
	test("warns on R/ before previous reaches S/", () => {
		expect(warningMessages("R/ a 1mg\nR/ b 2mg")).toContain(
			"New R/ starts before previous recipe reached S/.",
		);
	});

	test("warns on R/ after Da/ without S/", () => {
		expect(warningMessages("R/ a 1mg\nDa/ 14\nR/ b 2mg")).toContain(
			"New R/ starts before previous recipe reached S/.",
		);
	});

	test("warns on Da/ before any R/", () => {
		expect(warningMessages("Da/ 14 tablets")).toContain("Da/ must follow an R/ section.");
	});

	test("warns on duplicate Da/ in same recipe", () => {
		expect(warningMessages("R/ a 1mg\nDa/ 14\nDa/ 21")).toContain(
			"Duplicate Da/ section in same recipe.",
		);
	});

	test("warns on Da/ after S/", () => {
		expect(warningMessages("R/ a 1mg\nS/ take 1\nDa/ 14")).toContain(
			"Da/ after S/ is out of order; start a new recipe with R/.",
		);
	});

	test("warns on duplicate S/ in same recipe", () => {
		expect(warningMessages("R/ a 1mg\nS/ take 1\nS/ also")).toContain(
			"Duplicate S/ section in same recipe.",
		);
	});

	test("accepts valid R/ then S/ without Da/", () => {
		expect(warningMessages("R/ a 1mg\nS/ take 1")).toEqual([]);
	});

	test("accepts multiple valid R/ Da/ S/ blocks", () => {
		expect(
			warningMessages("R/ a 1mg\nDa/ 14\nS/ take 1\nR/ b 2mg\nDa/ 21\nS/ take 2"),
		).toEqual([]);
	});
});

describe("hoverForPosition", () => {
	test("maps UTF-16 positions onto tree-sitter UTF-8 columns", () => {
		const analysis = analyzer.analyzeRecipe("S/ vóór p.o.");
		const hover = analyzer.hoverForPosition(analysis, { line: 0, character: 8 });

		if (
			!hover
			|| typeof hover.contents === "string"
			|| Array.isArray(hover.contents)
			|| !("kind" in hover.contents)
		) {
			throw new Error("Expected markdown hover");
		}

		expect(hover.contents.kind).toBe("markdown");
		expect(hover.contents.value.includes("Route abbreviation")).toBe(true);
		expect(hover.contents.value.includes("`p.o.`")).toBe(true);
	});

	test("resolves hover past 3-byte UTF-8 characters", () => {
		// € is U+20AC, 3 bytes in UTF-8, 1 JS char
		const analysis = analyzer.analyzeRecipe("S/ €5 p.o.");
		const idx = analysis.text.indexOf("p.o.");
		const hover = analyzer.hoverForPosition(analysis, { line: 0, character: idx });
		if (!hover || typeof hover.contents === "string" || Array.isArray(hover.contents)) {
			throw new Error("Expected markdown hover");
		}
		expect("value" in hover.contents && hover.contents.value.includes("p.o.")).toBe(true);
	});

	test("resolves hover past 4-byte UTF-8 characters", () => {
		// 🍎 is U+1F34E, 4 bytes in UTF-8, 2 JS chars (surrogate pair)
		const analysis = analyzer.analyzeRecipe("S/ 🍎 p.o.");
		const idx = analysis.text.indexOf("p.o.");
		const hover = analyzer.hoverForPosition(analysis, { line: 0, character: idx });
		if (!hover || typeof hover.contents === "string" || Array.isArray(hover.contents)) {
			throw new Error("Expected markdown hover");
		}
		expect("value" in hover.contents && hover.contents.value.includes("p.o.")).toBe(true);
	});

	test("returns dose-unit hover over a unit token", () => {
		const analysis = analyzer.analyzeRecipe("R/ amoxicilline 500 mg");
		const idx = analysis.text.indexOf("mg");
		const hover = analyzer.hoverForPosition(analysis, { line: 0, character: idx });
		if (!hover || typeof hover.contents === "string" || Array.isArray(hover.contents)) {
			throw new Error("Expected markdown hover");
		}
		let value = "";
		if ("value" in hover.contents) {
			value = hover.contents.value;
		}
		expect(value.toLowerCase()).toContain("unit");
		expect(value).toContain("`mg`");
	});

	test("returns null when no node along the parent chain has hover info", () => {
		const analysis = analyzer.analyzeRecipe("R/ a 1mg");
		// Position far past EOF: descendant is recipe root; root has no hover info, parent is null.
		const hover = analyzer.hoverForPosition(analysis, {
			line: HOVER_LINE_OUT_OF_RANGE,
			character: HOVER_CHARACTER_OUT_OF_RANGE,
		});
		expect(hover).toBeNull();
	});
});

describe("completionItems", () => {
	test("contains markers, abbreviations, and units", () => {
		const labels = analyzer.completionItems().map((item) => item.label);

		expect(labels).toContain("R/");
		expect(labels).toContain("Da/");
		expect(labels).toContain("p.o.");
		expect(labels).toContain("mg");
	});
});

describe("getNodeRecipeAnalyzer", () => {
	test("memoizes the analyzer across calls", async () => {
		const second = await getNodeRecipeAnalyzer();
		expect(second).toBe(analyzer);
	});
});
