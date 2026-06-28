import { describe, expect, mock, test } from "bun:test";
import { CompletionItemKind, DiagnosticSeverity } from "vscode-languageserver";

import type { RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

mock.restore();

const nodeAnalyzerModule: typeof import("#runtime/node-analyzer.ts") = await import("#runtime/node-analyzer.ts");
const getNodeRecipeAnalyzer: typeof nodeAnalyzerModule.getNodeRecipeAnalyzer = nodeAnalyzerModule.getNodeRecipeAnalyzer;

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

describe("hoverForPosition basics", () => {
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

		const { kind, value } = hover.contents;
		expect(kind).toBe("markdown");
		expect(value.includes("Route abbreviation")).toBe(true);
		expect(value.includes("`p.o.`")).toBe(true);
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
			({ value } = hover.contents);
		}
		expect(value.toLowerCase()).toContain("unit");
		expect(value).toContain("`mg`");
	});

	test("returns null when no node along the parent chain has hover info", () => {
		const analysis = analyzer.analyzeRecipe("R/ a 1mg");
		const hover = analyzer.hoverForPosition(analysis, {
			line: HOVER_LINE_OUT_OF_RANGE,
			character: HOVER_CHARACTER_OUT_OF_RANGE,
		});
		expect(hover).toBeNull();
	});
});

describe("hoverForPosition with multi-byte input", () => {
	test("resolves hover past 3-byte UTF-8 characters", () => {
		const analysis = analyzer.analyzeRecipe("S/ €5 p.o.");
		const idx = analysis.text.indexOf("p.o.");
		const hover = analyzer.hoverForPosition(analysis, { line: 0, character: idx });
		if (!hover || typeof hover.contents === "string" || Array.isArray(hover.contents)) {
			throw new Error("Expected markdown hover");
		}
		expect("value" in hover.contents && hover.contents.value.includes("p.o.")).toBe(true);
	});

	test("resolves hover past 4-byte UTF-8 characters", () => {
		const analysis = analyzer.analyzeRecipe("S/ 🍎 p.o.");
		const idx = analysis.text.indexOf("p.o.");
		const hover = analyzer.hoverForPosition(analysis, { line: 0, character: idx });
		if (!hover || typeof hover.contents === "string" || Array.isArray(hover.contents)) {
			throw new Error("Expected markdown hover");
		}
		expect("value" in hover.contents && hover.contents.value.includes("p.o.")).toBe(true);
	});
});

describe("hoverForPosition meanings", () => {
	function hoverValue(source: string, character: number): string {
		const analysis = analyzer.analyzeRecipe(source);
		const hover = analyzer.hoverForPosition(analysis, { line: 0, character });
		if (
			!hover
			|| typeof hover.contents === "string"
			|| Array.isArray(hover.contents)
			|| !("value" in hover.contents)
		) {
			throw new Error("expected a markdown hover");
		}
		return hover.contents.value;
	}

	test("expands a dispensing abbreviation to its Latin and Dutch meaning", () => {
		const source = "S/ 1 tablet d.i.m.m.";
		const value = hoverValue(source, source.indexOf("d.i.m.m.") + 1);

		expect(value).toContain("da in mano medici");
		expect(value).toContain("in handen van de arts");
	});

	test("expands a compounding abbreviation", () => {
		const source = "R/ a 1mg q.s.";
		const value = hoverValue(source, source.indexOf("q.s.") + 1);

		expect(value).toContain("quantum satis");
		expect(value).toContain("zoveel als nodig");
	});

	test("expands the dtd directive keyword reached through an anonymous node", () => {
		const source = "R/ a 1mg dtd no 21";
		const value = hoverValue(source, source.indexOf("dtd") + 1);

		expect(value).toContain("da tales doses");
	});

	test("falls back to the generic category for a recognized but unglossed token", () => {
		const source = "R/ a 1mg d.s.p.";
		const value = hoverValue(source, source.indexOf("d.s.p.") + 1);

		expect(value).toContain("Dispensing abbreviation");
		expect(value).not.toContain("da in mano");
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

describe("completionsAt", () => {
	function labelsAt(source: string, line: number, character: number): string[] {
		const analysis = analyzer.analyzeRecipe(source);
		return analyzer.completionsAt(analysis, { line, character }).map((item) => item.label);
	}

	test("an empty document offers only section markers", () => {
		const labels = labelsAt("", 0, 0);

		expect(labels).toContain("R/");
		expect(labels).toContain("Da/");
		expect(labels).toContain("S/");
		expect(labels).not.toContain("mg");
		expect(labels).not.toContain("p.o.");
	});

	test("a dose number floats units to the front", () => {
		const source = "R/ amoxicilline 500 ";
		const analysis = analyzer.analyzeRecipe(source);
		const items = analyzer.completionsAt(analysis, { line: 0, character: source.length });

		const [first] = items;
		if (!first) {
			throw new Error("expected at least one completion after a dose number");
		}
		expect(first.kind).toBe(CompletionItemKind.Unit);
		expect(items.map((item) => item.label)).toContain("mg");
	});

	test("ingredient context excludes signa-only frequency vocab", () => {
		const labels = labelsAt("R/ amoxicilline ", 0, 16);

		expect(labels).toContain("mg");
		expect(labels).not.toContain("1 dd");
	});

	test("signa context offers frequency and route directions", () => {
		const labels = labelsAt("S/ 1 tablet ", 0, 12);

		expect(labels).toContain("1 dd");
		expect(labels).toContain("p.o.");
		expect(labels).not.toContain("R/");
	});

	test("a fresh line offers markers alongside the open section's vocab", () => {
		const labels = labelsAt("R/ a 1mg\n", 1, 0);

		expect(labels).toContain("R/");
		expect(labels).toContain("Da/");
		expect(labels).toContain("mg");
	});

	test("typing the first letter of a marker still surfaces markers", () => {
		const labels = labelsAt("R/ a 1mg\nD", 1, 1);

		expect(labels).toContain("Da/");
		expect(labels).toContain("D/");
	});

	test("dotted abbreviations carry an edit range over the whole token", () => {
		const source = "S/ 3 dd 1 caps p.";
		const analysis = analyzer.analyzeRecipe(source);
		const pc = analyzer
			.completionsAt(analysis, { line: 0, character: source.length })
			.find((item) => item.label === "p.c.");
		if (!pc?.textEdit || !("range" in pc.textEdit)) {
			throw new Error("expected p.c. with a textEdit range");
		}
		// Range starts at the `p` so the client filters the typed `p.` against the
		// full label instead of resetting its word at the dot.
		expect(pc.textEdit.range.start.character).toBe(source.indexOf("p."));
		expect(pc.textEdit.range.end.character).toBe(source.length);
		expect(pc.filterText).toBe("p.c.");
	});

	test("completion docs expand the abbreviation instead of naming its category", () => {
		const source = "S/ 3 dd 1 caps p.";
		const analysis = analyzer.analyzeRecipe(source);
		const pc = analyzer
			.completionsAt(analysis, { line: 0, character: source.length })
			.find((item) => item.label === "p.c.");
		if (!pc || typeof pc.documentation !== "object" || !("value" in pc.documentation)) {
			throw new Error("expected markdown documentation on p.c.");
		}
		expect(pc.detail).toContain("post cibum");
		expect(pc.detail).toContain("na de maaltijd");
		expect(pc.documentation.value).toContain("na de maaltijd");
	});
});

describe("semantic tokens", () => {
	test("classifies route abbreviations as function-like semantic tokens", () => {
		const analysis = analyzer.analyzeRecipe("S/ take p.o.");
		const functionTokenType = analyzer.semanticTokenLegend().indexOf("function");

		expect(functionTokenType).toBeGreaterThanOrEqual(0);
		expect(
			analysis.semanticTokens.some(
				(token) =>
					token.line === 0
					&& token.character === analysis.text.indexOf("p.o.")
					&& token.tokenType === functionTokenType,
			),
		).toBe(true);
	});
});

describe("folding ranges", () => {
	test("creates a region folding range for multi-line sections", () => {
		const analysis = analyzer.analyzeRecipe("R/ a 1mg\nb 2mg\nS/ take 1");

		expect(analysis.foldingRanges).toContainEqual({
			startLine: 0,
			endLine: 1,
			kind: "region",
		});
	});

	test("creates a comment folding range for multi-line block comments", () => {
		const analysis = analyzer.analyzeRecipe("/*\n * note\n */\nR/ a 1mg");

		expect(analysis.foldingRanges).toContainEqual({
			startLine: 0,
			endLine: 2,
			kind: "comment",
		});
	});
});

describe("selectionRanges", () => {
	test("builds nested selection ranges from token to section", () => {
		const analysis = analyzer.analyzeRecipe("R/ amoxicilline 500mg\nS/ take 1");
		const position = { line: 0, character: 6 };
		const [selection] = analyzer.selectionRanges(analysis, [position]);
		if (!selection) {
			throw new Error("expected a selection range");
		}

		expect(selection.range).toEqual({
			start: { line: 0, character: 3 },
			end: { line: 0, character: 15 },
		});
		expect(selection.parent?.range).toEqual({
			start: { line: 0, character: 3 },
			end: { line: 0, character: 21 },
		});
		expect(selection.parent?.parent?.range).toEqual({
			start: { line: 0, character: 0 },
			end: { line: 0, character: 21 },
		});
	});
});

describe("getNodeRecipeAnalyzer", () => {
	test("memoizes the analyzer across calls", async () => {
		const second = await getNodeRecipeAnalyzer();
		expect(second).toBe(analyzer);
	});
});
