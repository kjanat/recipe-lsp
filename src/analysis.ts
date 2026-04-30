import {
	type CompletionItem,
	type Diagnostic,
	type DocumentSymbol,
	type Hover,
	MarkupKind,
	type Position,
} from "vscode-languageserver";
import type { Node, Parser, Tree } from "web-tree-sitter";

import { splitLines, toPoint, toRange } from "./coords.ts";
import { buildSymbols, collectSectionDiagnostics, collectSyntaxDiagnostics } from "./diagnostics.ts";
import { completionItems as vocabularyCompletionItems } from "./vocabulary-completions.ts";
import { hoverInfoForNode } from "./vocabulary-hover.ts";

function analyzeWithParser(parser: Parser, text: string): RecipeAnalysis {
	const tree = parser.parse(text);
	if (!tree) {
		throw new Error("Recipe parser returned null");
	}

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
	};
}

export function hoverForPosition(
	analysis: RecipeAnalysis,
	position: Position,
): Hover | null {
	const point = toPoint(analysis.lines, position);
	let current: Node | null = analysis.tree.rootNode.namedDescendantForPosition(
		point,
		point,
	);

	while (current) {
		const info = hoverInfoForNode(current.type, current.text);
		if (info) {
			return {
				contents: {
					kind: MarkupKind.Markdown,
					value: `**${info.title}**\n\n\`${current.text}\`\n\n${info.detail}`,
				},
				range: toRange(analysis.lines, current),
			};
		}

		current = current.parent;
	}

	return null;
}

export function completionItems(): CompletionItem[] {
	return vocabularyCompletionItems();
}

export function createRecipeAnalyzer(parser: Parser): RecipeAnalyzer {
	return {
		analyzeRecipe: (text: string): RecipeAnalysis => analyzeWithParser(parser, text),
		hoverForPosition,
		completionItems,
	};
}

export interface RecipeAnalysis {
	text: string;
	lines: string[];
	tree: Tree;
	diagnostics: Diagnostic[];
	symbols: DocumentSymbol[];
}

export interface RecipeAnalyzer {
	analyzeRecipe: (text: string) => RecipeAnalysis;
	hoverForPosition: (analysis: RecipeAnalysis, position: Position) => Hover | null;
	completionItems: () => CompletionItem[];
}
