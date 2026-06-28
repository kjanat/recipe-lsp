import { byteColumnToCharacter, toPoint, toRange } from "#anal/lsp-positions.ts";
import { walk } from "#anal/tree-walk.ts";
import type { CompletionContext, CompletionSection } from "#vocab/completions.ts";

import type { FoldingRange, Position, Range, SelectionRange } from "vscode-languageserver";
import type { Node, Point } from "web-tree-sitter";

const COMMENT_FOLD_KIND = "comment";
const REGION_FOLD_KIND = "region";
const TOKEN_MODIFIERS = 0;

/** Any single whitespace character. Must not be global/sticky; `.test()` should stay stateless. */
const WHITESPACE = /\s/u;

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

type SemanticTokenType = (typeof TOKEN_TYPES)[number];

const TOKEN_TYPE_INDEX: ReadonlyMap<SemanticTokenType, number> = new Map(
	TOKEN_TYPES.map((type, index) => [type, index]),
);

const MARKER_SECTIONS: ReadonlyMap<string, CompletionSection> = new Map([
	["rx_marker", "rx"],
	["dispense_marker", "dispense"],
	["signa_marker", "signa"],
]);

const FOLDABLE_NODE_TYPES: ReadonlySet<string> = new Set([
	"rx_section",
	"dispense_section",
	"signa_section",
	"block_comment",
	"doc_comment_block",
]);

const COMMENT_NODE_TYPES: ReadonlySet<string> = new Set([
	"line_comment",
	"block_comment",
	"doc_comment_line",
	"doc_comment_block",
]);

const DIRECT_TOKEN_TYPES: ReadonlyMap<string, SemanticTokenType> = new Map([
	["rx_marker", "keyword"],
	["dispense_marker", "keyword"],
	["signa_marker", "keyword"],

	// `frequency` is a container of `number` + `period`/`count_word`.
	// Tokenizing the container would overlap its children, so only classify leaves.
	["period", "keyword"],
	["count_word", "keyword"],
	["frequency_abbrev", "keyword"],
	["timing_abbrev", "keyword"],
	["conditional_abbrev", "keyword"],

	["number", "number"],

	["unit", "type"],
	["form_abbrev", "type"],

	["route_abbrev", "function"],

	["dispensing_abbrev", "property"],

	["warning_abbrev", "macro"],

	["compounding_abbrev", "operator"],
	["fill_marker", "operator"],
	["dtd_keyword", "operator"],
	["dtd_no", "operator"],
]);

export interface SemanticTokenSpan {
	line: number;
	character: number;
	length: number;
	tokenType: number;
	tokenModifiers: number;
}

function nextNamedParent(node: Node | null): Node | null {
	let parent = node?.parent ?? null;

	while (parent && !parent.isNamed) {
		parent = parent.parent;
	}

	return parent;
}

function comparePoints(left: Point, right: Point): number {
	return left.row === right.row ? left.column - right.column : left.row - right.row;
}

function isAfter(left: Point, right: Point): boolean {
	return comparePoints(left, right) > 0;
}

function rangeKey(range: Range): string {
	const { start, end } = range;
	return `${start.line}:${start.character}:${end.line}:${end.character}`;
}

function emptyRange(position: Position): Range {
	return { start: position, end: position };
}

function tokenTypeIndex(type: SemanticTokenType): number {
	const index = TOKEN_TYPE_INDEX.get(type);
	if (index === undefined) {
		throw new RangeError(`Unknown semantic token type: ${type}`);
	}

	return index;
}

function tokenTypeForWord(parentType: string | undefined): SemanticTokenType | null {
	switch (parentType) {
		case "ingredient_line":
		case "dispense_body":
			return "variable";
		case "signa_line":
			return "string";
		default:
			return null;
	}
}

function tokenTypeForNode(node: Node): SemanticTokenType | null {
	if (COMMENT_NODE_TYPES.has(node.type)) {
		return "comment";
	}

	if (node.type === "word") {
		return tokenTypeForWord(nextNamedParent(node)?.type);
	}

	return DIRECT_TOKEN_TYPES.get(node.type) ?? null;
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

function compareSemanticTokens(left: SemanticTokenSpan, right: SemanticTokenSpan): number {
	return (
		left.line - right.line
		|| left.character - right.character
		|| left.length - right.length
	);
}

function foldRangeKind(nodeType: string): string {
	return COMMENT_NODE_TYPES.has(nodeType) ? COMMENT_FOLD_KIND : REGION_FOLD_KIND;
}

function foldEndLine(range: Range): number {
	return range.end.character === 0
		? Math.max(range.start.line, range.end.line - 1)
		: range.end.line;
}

function buildSelectionRangeChain(ranges: readonly Range[]): SelectionRange | null {
	let parent: SelectionRange | undefined;

	for (let index = ranges.length - 1; index >= 0; index -= 1) {
		const range = ranges[index];
		if (!range) {
			continue;
		}

		parent = parent ? { range, parent } : { range };
	}

	return parent ?? null;
}

function firstTokenContainsCursor(lines: string[], position: Position): boolean {
	// `trimStart` keeps indentation tolerance but preserves a trailing space —
	// that delimiter is exactly the signal that the cursor has left the first
	// token, so markers should no longer be offered.
	const prefix = (lines[position.line] ?? "").slice(0, position.character).trimStart();
	return !WHITESPACE.test(prefix);
}

/**
 * True when `node` is a bare number whose end touches the cursor with only
 * whitespace in between. In that context, a unit is the natural next token.
 */
function isNumberImmediatelyLeft(lines: string[], node: Node, cursor: Point): boolean {
	const end = node.endPosition;

	if (end.row !== cursor.row || end.column > cursor.column) {
		return false;
	}

	const line = lines[cursor.row] ?? "";
	const from = byteColumnToCharacter(line, end.column);
	const to = byteColumnToCharacter(line, cursor.column);

	return line.slice(from, to).trim() === "";
}

export function semanticTokenTypes(): readonly string[] {
	return TOKEN_TYPES;
}

export function buildSemanticTokenSpans(lines: string[], root: Node): SemanticTokenSpan[] {
	const tokens: SemanticTokenSpan[] = [];

	walk(root, (node) => {
		const tokenType = tokenTypeForNode(node);
		if (tokenType) {
			pushSemanticToken(tokens, lines, node, tokenType);
		}
	});

	return tokens.sort(compareSemanticTokens);
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

/**
 * Classifies the completion context at `position`.
 *
 * The active section is the nearest marker at or before the cursor. This stays
 * robust for half-parsed trees, including completion requests inside `ERROR`
 * nodes while the user is still typing.
 */
export function completionContextAt(
	lines: string[],
	root: Node,
	position: Position,
): CompletionContext {
	const cursor = toPoint(lines, position);
	const atLineStart = firstTokenContainsCursor(lines, position);

	let section: CompletionSection = "top-level";
	let markerStart: Point | null = null;
	let afterNumber = false;

	walk(root, (node) => {
		// A node (and its whole subtree) that starts after the cursor can hold
		// neither a marker at-or-before the cursor nor a number left of it, so
		// prune it. This keeps the ERROR-nested robustness while skipping the
		// entire document to the right of the cursor.
		if (isAfter(node.startPosition, cursor)) {
			return false;
		}

		const markerSection = MARKER_SECTIONS.get(node.type);
		if (markerSection && (markerStart === null || isAfter(node.startPosition, markerStart))) {
			markerStart = node.startPosition;
			section = markerSection;
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
		const ranges: Range[] = [];
		const seen = new Set<string>();

		let node: Node | null = root.namedDescendantForPosition(point, point);

		while (node) {
			const range = toRange(lines, node);
			const key = rangeKey(range);

			if (!seen.has(key)) {
				seen.add(key);
				ranges.push(range);
			}

			node = nextNamedParent(node);
		}

		return buildSelectionRangeChain(ranges) ?? { range: emptyRange(position) };
	});
}
