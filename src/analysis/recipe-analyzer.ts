import { buildSymbols, collectSectionDiagnostics, collectSyntaxDiagnostics } from "#anal/diagnostics.ts";
import type { SemanticTokenSpan } from "#anal/lsp-features.ts";
import {
	buildFoldingRanges,
	buildSelectionRanges,
	buildSemanticTokenSpans,
	completionContextAt,
	semanticTokenTypes,
} from "#anal/lsp-features.ts";
import { currentTokenRange, splitLines, toPoint, toRange } from "#anal/lsp-positions.ts";
import { completionItems as vocabularyCompletionItems, completionsForContext } from "#vocab/completions.ts";
import { hoverInfoForNode } from "#vocab/hover.ts";

import type {
	CompletionItem,
	Diagnostic,
	DocumentSymbol,
	FoldingRange,
	Hover,
	Position,
	SelectionRange,
} from "vscode-languageserver";
import { MarkupKind } from "vscode-languageserver";
import type { Node, Parser, Tree } from "web-tree-sitter";

function analyzeWithParser(parser: Parser, text: string): RecipeAnalysis {
	const tree = parser.parse(text);
	if (!tree) throw new Error("Recipe parser returned null");

	const lines = splitLines(text);
	const root = tree.rootNode;
	return {
		text,
		lines,
		tree,
		diagnostics: [
			...collectSyntaxDiagnostics(lines, root),
			...collectSectionDiagnostics(lines, root),
		],
		symbols: buildSymbols(lines, root),
		foldingRanges: buildFoldingRanges(lines, root),
		semanticTokens: buildSemanticTokenSpans(lines, root),
	};
}

export function hoverForPosition(
	analysis: RecipeAnalysis,
	position: Position,
): Hover | null {
	const point = toPoint(analysis.lines, position);
	/** Start from the full descendant (not just named nodes) so anonymous keyword
	 * tokens like `dtd_keyword` and `fill_marker` are reachable; the walk climbs
	 * `.parent` to find the nearest node with hover info either way. */
	let current: Node | null = analysis.tree.rootNode.descendantForPosition(point, point);

	while (current) {
		const info = hoverInfoForNode(current.type, current.text);
		if (info) {
			return {
				contents: { kind: MarkupKind.Markdown, value: `**${info.title}**\n\n\`${current.text}\`\n\n${info.detail}` },
				range: toRange(analysis.lines, current),
			};
		}
		current = current.parent;
	}
	return null;
}

export function completionItems(): ReturnType<RecipeAnalyzer["completionItems"]> {
	return vocabularyCompletionItems();
}

export function completionsAt(analysis: RecipeAnalysis, position: Position): CompletionItem[] {
	const context = completionContextAt(analysis.lines, analysis.tree.rootNode, position);
	const range = currentTokenRange(analysis.lines, position);

	/** Anchor every item to the current token so dotted abbreviations (`p.c.`)
	 * filter against the full token instead of the editor's `.`-split word. */
	return completionsForContext(context).map((item) => ({
		...item,
		filterText: item.filterText ?? item.label,
		textEdit: { range, newText: item.insertText ?? item.label },
	}));
}

export function selectionRanges(analysis: RecipeAnalysis, positions: readonly Position[]): SelectionRange[] {
	return buildSelectionRanges(analysis.lines, analysis.tree.rootNode, positions);
}

export function semanticTokenLegend(): ReturnType<RecipeAnalyzer["semanticTokenLegend"]> {
	return semanticTokenTypes();
}

export function createRecipeAnalyzer(parser: Parser): RecipeAnalyzer {
	return {
		analyzeRecipe: (text: string): RecipeAnalysis => analyzeWithParser(parser, text),
		hoverForPosition,
		completionItems,
		completionsAt,
		selectionRanges,
		semanticTokenLegend,
	};
}

export interface RecipeAnalysis {
	text: string;
	lines: string[];
	tree: Tree;
	diagnostics: Diagnostic[];
	symbols: DocumentSymbol[];
	foldingRanges: FoldingRange[];
	semanticTokens: SemanticTokenSpan[];
}

export interface RecipeAnalyzer {
	analyzeRecipe: (text: string) => RecipeAnalysis;
	hoverForPosition: (analysis: RecipeAnalysis, position: Position) => Hover | null;
	completionItems: () => CompletionItem[];
	completionsAt: (analysis: RecipeAnalysis, position: Position) => CompletionItem[];
	selectionRanges: (analysis: RecipeAnalysis, positions: readonly Position[]) => SelectionRange[];
	semanticTokenLegend: () => readonly string[];
}
