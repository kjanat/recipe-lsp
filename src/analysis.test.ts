import { describe, expect, test } from "bun:test";

import { analyzeRecipe, completionItems, hoverForPosition } from "./analysis.ts";

describe("analyzeRecipe", () => {
	test("returns section symbols for a valid recipe", () => {
		const analysis = analyzeRecipe(
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
		const analysis = analyzeRecipe("R/ claritromycin ???");

		expect(
			analysis.diagnostics.some((diagnostic) => diagnostic.message.startsWith("Unexpected syntax")),
		).toBe(true);
	});

	test("warns on section order issues", () => {
		const analysis = analyzeRecipe("S/ take 1 tablet\nR/ amoxicilline 500mg");

		expect(
			analysis.diagnostics.some(
				(diagnostic) => diagnostic.message === "S/ must follow an R/ section.",
			),
		).toBe(true);
	});
});

describe("hoverForPosition", () => {
	test("maps UTF-16 positions onto tree-sitter UTF-8 columns", () => {
		const analysis = analyzeRecipe("S/ vóór p.o.");
		const hover = hoverForPosition(analysis, { line: 0, character: 8 });

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
});

describe("completionItems", () => {
	test("contains markers, abbreviations, and units", () => {
		const labels = completionItems().map((item) => item.label);

		expect(labels).toContain("R/");
		expect(labels).toContain("Da/");
		expect(labels).toContain("p.o.");
		expect(labels).toContain("mg");
	});
});
