import type { FoldingRange, Position, Range, SelectionRange } from "vscode-languageserver";
import type { Node, Point } from "web-tree-sitter";

import type { CompletionContext, CompletionSection } from "#vocab/completions.ts";
import { byteColumnToCharacter, toPoint, toRange } from "./lsp-positions.ts";

const MARKER_SECTION: ReadonlyMap<string, CompletionSection> = new Map([
	["rx_marker", "rx"],
	["dispense_marker", "dispense"],
	["signa_marker", "signa"],
]);

const COMMENT_FOLD_KIND = "comment";
const REGION_FOLD_KIND = "region";
const TOKEN_MODIFIERS = 0;

const TOKEN_TYPES = [
	"keyword",
	"number",
	"type",
	"function",
	"property",
	"macro",
	"operator",
	"variable",
	"string",
	"comment",
] as const;

const FOLDABLE_NODE_TYPES = new Set([
	"rx_section",
	"dispense_section",
	"signa_section",
	"block_comment",
	"doc_comment_block",
]);

const COMMENT_NODE_TYPES = new Set([
	"line_comment",
	"block_comment",
	"doc_comment_line",
	"doc_comment_block",
]);

const SEMANTIC_TOKEN_TYPES: readonly string[] = [...TOKEN_TYPES];

type SemanticTokenType = (typeof TOKEN_TYPES)[number];

export interface SemanticTokenSpan {
	line: number;
	character: number;
	length: number;
	tokenType: number;
	tokenModifiers: number;
}

function walk(node: Node, visit: (node: Node) => void): void {
	visit(node);
	for (const child of node.children) {
		walk(child, visit);
	}
}

function nextNamedParent(node: Node | null): Node | null {
	let current = node?.parent ?? null;
	while (current && !current.isNamed) {
		current = current.parent;
	}
	return current;
}

function rangeKey(range: Range): string {
	const { start, end } = range;
	return `${start.line}:${start.character}:${end.line}:${end.character}`;
}

function tokenTypeIndex(type: SemanticTokenType): number {
	return TOKEN_TYPES.indexOf(type);
}

function tokenTypeForWordParent(parentType: string | undefined): SemanticTokenType | null {
	if (parentType === "ingredient_line" || parentType === "dispense_body") {
		return "variable";
	}
	if (parentType === "signa_line") {
		return "string";
	}
	return null;
}

function tokenTypeForNode(node: Node): SemanticTokenType | null {
	switch (node.type) {
		case "rx_marker":
		case "dispense_marker":
		case "signa_marker":
		// `frequency` ("3 dd") is a container of `number` + `period`; tokenizing it
		// would overlap the inner `number` span, so classify the `period` leaf
		// instead and leave the container untyped.
		case "period":
		case "frequency_abbrev":
		case "timing_abbrev":
		case "conditional_abbrev":
			return "keyword";
		case "number":
			return "number";
		case "unit":
		case "form_abbrev":
			return "type";
		case "route_abbrev":
			return "function";
		case "dispensing_abbrev":
			return "property";
		case "warning_abbrev":
			return "macro";
		case "compounding_abbrev":
		case "fill_marker":
		case "dtd_keyword":
		case "dtd_no":
			return "operator";
		case "word":
			return tokenTypeForWordParent(nextNamedParent(node)?.type);
		case "line_comment":
		case "block_comment":
		case "doc_comment_line":
		case "doc_comment_block":
			return "comment";
		default:
			return null;
	}
}

function pushSemanticTokenLine(
	tokens: SemanticTokenSpan[],
	line: number,
	character: number,
	length: number,
	tokenType: SemanticTokenType,
): void {
	if (length <= 0) {
		return;
	}

	tokens.push({
		line,
		character,
		length,
		tokenType: tokenTypeIndex(tokenType),
		tokenModifiers: TOKEN_MODIFIERS,
	});
}

function pushSemanticToken(
	tokens: SemanticTokenSpan[],
	lines: string[],
	node: Node,
	tokenType: SemanticTokenType,
): void {
	const range = toRange(lines, node);
	if (range.start.line === range.end.line) {
		pushSemanticTokenLine(
			tokens,
			range.start.line,
			range.start.character,
			range.end.character - range.start.character,
			tokenType,
		);
		return;
	}

	for (let line = range.start.line; line <= range.end.line; line += 1) {
		const text = lines[line] ?? "";
		const startCharacter = line === range.start.line ? range.start.character : 0;
		const endCharacter = line === range.end.line ? range.end.character : text.length;
		pushSemanticTokenLine(tokens, line, startCharacter, endCharacter - startCharacter, tokenType);
	}
}

function foldRangeKind(nodeType: string): string {
	return COMMENT_NODE_TYPES.has(nodeType) ? COMMENT_FOLD_KIND : REGION_FOLD_KIND;
}

function foldEndLine(range: Range): number {
	if (range.end.character === 0) {
		return Math.max(range.start.line, range.end.line - 1);
	}
	return range.end.line;
}

function buildSelectionRangeChain(ranges: Range[]): SelectionRange | null {
	const firstRange = ranges[0];
	if (!firstRange) {
		return null;
	}

	let current: SelectionRange | null = null;
	for (let index = ranges.length - 1; index >= 0; index -= 1) {
		const range = ranges[index] ?? firstRange;
		current = current ? { range, parent: current } : { range };
	}
	return current;
}

export function semanticTokenTypes(): readonly string[] {
	return SEMANTIC_TOKEN_TYPES;
}

export function buildSemanticTokenSpans(lines: string[], root: Node): SemanticTokenSpan[] {
	const tokens: SemanticTokenSpan[] = [];

	walk(root, (node) => {
		const tokenType = tokenTypeForNode(node);
		if (tokenType !== null) {
			pushSemanticToken(tokens, lines, node, tokenType);
		}
	});

	tokens.sort((left, right) => {
		if (left.line !== right.line) {
			return left.line - right.line;
		}
		if (left.character !== right.character) {
			return left.character - right.character;
		}
		return left.length - right.length;
	});

	return tokens;
}

export function buildFoldingRanges(lines: string[], root: Node): FoldingRange[] {
	const ranges: FoldingRange[] = [];

	walk(root, (node) => {
		if (!FOLDABLE_NODE_TYPES.has(node.type)) {
			return;
		}

		const range = toRange(lines, node);
		const endLine = foldEndLine(range);
		if (endLine <= range.start.line) {
			return;
		}

		ranges.push({
			startLine: range.start.line,
			endLine,
			kind: foldRangeKind(node.type),
		});
	});

	return ranges;
}

function comparePoints(left: Point, right: Point): number {
	return left.row === right.row ? left.column - right.column : left.row - right.row;
}

/**
 * True when `node` is a bare number whose end touches the cursor with only
 * whitespace in between — i.e. the user just typed a dose amount and a unit is
 * the natural next token.
 */
function isNumberImmediatelyLeft(lines: string[], node: Node, cursor: Point): boolean {
	const end = node.endPosition;
	if (end.row !== cursor.row || end.column > cursor.column) {
		return false;
	}

	const line = lines[cursor.row] ?? "";
	const fromCharacter = byteColumnToCharacter(line, end.column);
	const toCharacter = byteColumnToCharacter(line, cursor.column);
	return line.slice(fromCharacter, toCharacter).trim() === "";
}

/**
 * Classify the completion context at `position`. The active section is the
 * nearest marker at or before the cursor — robust to the half-parsed
 * (`ERROR`-wrapped) trees that completion requests routinely land on.
 */
export function completionContextAt(
	lines: string[],
	root: Node,
	position: Position,
): CompletionContext {
	const cursor = toPoint(lines, position);
	const lineBeforeCursor = (lines[position.line] ?? "").slice(0, position.character).trim();
	// A marker is always a line's first token, so offer markers while the cursor is
	// still inside that first token (empty prefix, or a single word with no whitespace).
	const atLineStart = !/\s/u.test(lineBeforeCursor);
	let section: CompletionSection = "top-level";
	let markerStart: Point | null = null;
	let afterNumber = false;

	walk(root, (node) => {
		const markerSection = MARKER_SECTION.get(node.type);
		if (markerSection && comparePoints(node.startPosition, cursor) <= 0) {
			if (markerStart === null || comparePoints(node.startPosition, markerStart) > 0) {
				markerStart = node.startPosition;
				section = markerSection;
			}
		}

		if (node.type === "number" && isNumberImmediatelyLeft(lines, node, cursor)) {
			afterNumber = true;
		}
	});

	return { section, afterNumber, atLineStart };
}

export function buildSelectionRanges(
	lines: string[],
	root: Node,
	positions: readonly Position[],
): SelectionRange[] {
	return positions.map((position) => {
		const point = toPoint(lines, position);
		let node = root.namedDescendantForPosition(point, point);
		const ranges: Range[] = [];
		const seen = new Set<string>();

		while (node) {
			const range = toRange(lines, node);
			const key = rangeKey(range);
			if (!seen.has(key)) {
				seen.add(key);
				ranges.push(range);
			}
			node = nextNamedParent(node);
		}

		const chain = buildSelectionRangeChain(ranges);
		return chain ?? { range: { start: position, end: position } };
	});
}
