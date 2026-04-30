import { Buffer } from "node:buffer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type CompletionItem,
	type Diagnostic,
	DiagnosticSeverity,
	type DocumentSymbol,
	type Hover,
	MarkupKind,
	type Position,
	type Range,
	SymbolKind,
} from "vscode-languageserver/node";
import { Language, type Node, Parser, type Point, type Tree } from "web-tree-sitter";

import { completionItems as vocabularyCompletionItems, hoverInfoForNode } from "./vocabulary.ts";

export type RecipeAnalysis = {
	text: string;
	lines: string[];
	tree: Tree;
	diagnostics: Diagnostic[];
	symbols: DocumentSymbol[];
};

type SectionState = "start" | "rx" | "dispense" | "signa";

const runtimeWasmPath = fileURLToPath(
	import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm"),
);
const recipeRoot = dirname(
	fileURLToPath(import.meta.resolve("tree-sitter-recipe/package.json")),
);
const recipeWasmPath = join(recipeRoot, "tree-sitter-recipe.wasm");

async function createParser(): Promise<Parser> {
	await Parser.init({
		locateFile(scriptName: string): string {
			if (
				scriptName === "tree-sitter.wasm"
				|| scriptName === "web-tree-sitter.wasm"
			) {
				return runtimeWasmPath;
			}

			return scriptName;
		},
	});

	const parser = new Parser();
	const language = await Language.load(recipeWasmPath);
	parser.setLanguage(language);
	return parser;
}

const parser: Parser = await createParser();

function splitLines(text: string): string[] {
	return text.split(/\r?\n/u);
}

function byteColumnToCharacter(line: string, byteColumn: number): number {
	let bytes = 0;
	let character = 0;

	for (const chunk of line) {
		if (bytes >= byteColumn) {
			return character;
		}

		bytes += Buffer.byteLength(chunk, "utf8");
		character += chunk.length;
	}

	return character;
}

function characterToByteColumn(line: string, character: number): number {
	let bytes = 0;
	let consumed = 0;

	for (const chunk of line) {
		if (consumed >= character) {
			return bytes;
		}

		bytes += Buffer.byteLength(chunk, "utf8");
		consumed += chunk.length;
	}

	return bytes;
}

function clampLine(lines: string[], line: number): string {
	return (
		lines[Math.max(0, Math.min(line, Math.max(lines.length - 1, 0)))] ?? ""
	);
}

function toPosition(lines: string[], point: Point): Position {
	const line = clampLine(lines, point.row);
	return {
		line: point.row,
		character: byteColumnToCharacter(line, point.column),
	};
}

function toPoint(lines: string[], position: Position): Point {
	const line = clampLine(lines, position.line);
	return {
		row: position.line,
		column: characterToByteColumn(line, position.character),
	};
}

function toRange(lines: string[], node: Node): Range {
	return {
		start: toPosition(lines, node.startPosition),
		end: toPosition(lines, node.endPosition),
	};
}

function humanize(type: string): string {
	return type.replaceAll("_", " ");
}

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/gu, " ").trim();
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function walk(node: Node, visit: (node: Node) => void): void {
	visit(node);
	for (const child of node.children) {
		walk(child, visit);
	}
}

function pushDiagnostic(
	diagnostics: Diagnostic[],
	seen: Set<string>,
	diagnostic: Diagnostic,
): void {
	const key =
		`${diagnostic.range.start.line}:${diagnostic.range.start.character}:${diagnostic.range.end.line}:${diagnostic.range.end.character}:${diagnostic.message}`;
	if (seen.has(key)) {
		return;
	}

	seen.add(key);
	diagnostics.push(diagnostic);
}

function collectSyntaxDiagnostics(lines: string[], root: Node): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const seen = new Set<string>();

	walk(root, (node) => {
		if (node.isMissing) {
			pushDiagnostic(diagnostics, seen, {
				severity: DiagnosticSeverity.Error,
				range: toRange(lines, node),
				message: `Missing ${humanize(node.type)}`,
				source: "recipe-lsp",
			});
			return;
		}

		if (!node.isError) {
			return;
		}

		const snippet = truncate(collapseWhitespace(node.text), 40);
		const suffix = snippet.length > 0 ? ` near \`${snippet}\`` : "";
		pushDiagnostic(diagnostics, seen, {
			severity: DiagnosticSeverity.Error,
			range: toRange(lines, node),
			message: `Unexpected syntax${suffix}`,
			source: "recipe-lsp",
		});
	});

	return diagnostics;
}

function collectSectionDiagnostics(lines: string[], root: Node): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	let state: SectionState = "start";

	for (const node of root.namedChildren) {
		if (
			node.type !== "rx_section"
			&& node.type !== "dispense_section"
			&& node.type !== "signa_section"
		) {
			continue;
		}

		const marker = node.firstNamedChild ?? node;
		const range = toRange(lines, marker);

		if (node.type === "rx_section") {
			if (state === "rx" || state === "dispense") {
				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range,
					message: "New R/ starts before previous recipe reached S/.",
					source: "recipe-lsp",
				});
			}

			state = "rx";
			continue;
		}

		if (node.type === "dispense_section") {
			switch (state) {
				case "start":
					diagnostics.push({
						severity: DiagnosticSeverity.Warning,
						range,
						message: "Da/ must follow an R/ section.",
						source: "recipe-lsp",
					});
					break;
				case "dispense":
					diagnostics.push({
						severity: DiagnosticSeverity.Warning,
						range,
						message: "Duplicate Da/ section in same recipe.",
						source: "recipe-lsp",
					});
					break;
				case "signa":
					diagnostics.push({
						severity: DiagnosticSeverity.Warning,
						range,
						message: "Da/ after S/ is out of order; start a new recipe with R/.",
						source: "recipe-lsp",
					});
					break;
				case "rx":
					break;
			}

			state = "dispense";
			continue;
		}

		switch (state) {
			case "start":
				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range,
					message: "S/ must follow an R/ section.",
					source: "recipe-lsp",
				});
				break;
			case "signa":
				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range,
					message: "Duplicate S/ section in same recipe.",
					source: "recipe-lsp",
				});
				break;
			case "rx":
			case "dispense":
				break;
		}

		state = "signa";
	}

	return diagnostics;
}

function sectionDetail(type: string): string {
	switch (type) {
		case "rx_section":
			return "Ingredient section";
		case "dispense_section":
			return "Dispense section";
		case "signa_section":
			return "Signa section";
		default:
			return "Section";
	}
}

function buildSymbols(lines: string[], root: Node): DocumentSymbol[] {
	const symbols: DocumentSymbol[] = [];

	for (const node of root.namedChildren) {
		if (
			node.type !== "rx_section"
			&& node.type !== "dispense_section"
			&& node.type !== "signa_section"
		) {
			continue;
		}

		const marker = node.firstNamedChild ?? node;
		const firstLine = collapseWhitespace(
			node.text.split(/\r?\n/u, 1)[0] ?? sectionDetail(node.type),
		);
		symbols.push({
			name: truncate(firstLine, 80),
			detail: sectionDetail(node.type),
			kind: SymbolKind.Namespace,
			range: toRange(lines, node),
			selectionRange: toRange(lines, marker),
			children: [],
		});
	}

	return symbols;
}

export function analyzeRecipe(text: string): RecipeAnalysis {
	const tree = parser.parse(text);
	const lines = splitLines(text);
	if (!tree) {
		throw new Error("Recipe parser returned null");
	}

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
