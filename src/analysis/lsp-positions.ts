import type { Position, Range } from "vscode-languageserver";
import type { Node, Point } from "web-tree-sitter";

const LINE_BREAK = /\r\n?|\n/u;
const TOKEN_BOUNDARY = /\s/u;
/** Any code point outside US-ASCII. Stateless (no global/sticky flag). */
const NON_ASCII = /\P{ASCII}/u;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

function utf8ByteLength(codePoint: string): number {
	const cp = codePoint.codePointAt(0) ?? 0;
	switch (true) {
		case cp < 0x80:
			return 1;
		case cp < 0x8_00:
			return 2;
		case cp < 0x1_00_00:
			return 3;
		default:
			return 4;
	}
}
function lineAt(lines: string[], line: number): string {
	const lastLine = Math.max(lines.length - 1, 0);
	return lines[clamp(line, 0, lastLine)] ?? "";
}

function characterAt(line: string, character: number): string {
	return line.charAt(character);
}

function isTokenBoundary(character: string): boolean {
	return TOKEN_BOUNDARY.test(character);
}

export function splitLines(text: string): string[] {
	return text.split(LINE_BREAK);
}

export function firstLineOf(text: string): string {
	return splitLines(text)[0] ?? "";
}

export function byteColumnToCharacter(line: string, byteColumn: number): number {
	const target = Math.max(byteColumn, 0);

	// ASCII fast path: every code point is 1 byte == 1 UTF-16 unit, so the byte
	// column is already the character column. Skips the per-code-point loop
	// (which allocates a substring per iteration) for the common ASCII line.
	if (!NON_ASCII.test(line)) {
		return Math.min(target, line.length);
	}

	let bytes = 0;
	let character = 0;

	for (const codePoint of line) {
		if (bytes >= target) {
			return character;
		}

		bytes += utf8ByteLength(codePoint);
		character += codePoint.length;
	}

	return character;
}

export function characterToByteColumn(line: string, character: number): number {
	const target = clamp(character, 0, line.length);

	// ASCII fast path: 1 UTF-16 unit == 1 byte, so the character column is the
	// byte column.
	if (!NON_ASCII.test(line)) {
		return target;
	}

	let bytes = 0;
	let consumed = 0;

	for (const codePoint of line) {
		if (consumed >= target) {
			return bytes;
		}

		bytes += utf8ByteLength(codePoint);
		consumed += codePoint.length;
	}

	return bytes;
}

export function toPosition(lines: string[], point: Point): Position {
	const line = lineAt(lines, point.row);

	return {
		line: point.row,
		character: byteColumnToCharacter(line, point.column),
	};
}

export function toPoint(lines: string[], position: Position): Point {
	const line = lineAt(lines, position.line);

	return {
		row: position.line,
		column: characterToByteColumn(line, position.character),
	};
}

export function toRange(lines: string[], node: Node): Range {
	return {
		start: toPosition(lines, node.startPosition),
		end: toPosition(lines, node.endPosition),
	};
}

/**
 * Returns the whitespace-delimited token surrounding `position`.
 *
 * Completion ranges use the full token so clients filter against recipe
 * abbreviations as written. This matters because abbreviations may contain `.`,
 * which many editors otherwise treat as a word boundary.
 */
export function currentTokenRange(lines: string[], position: Position): Range {
	const line = lineAt(lines, position.line);
	const character = clamp(position.character, 0, line.length);

	let start = character;
	while (start > 0 && !isTokenBoundary(characterAt(line, start - 1))) {
		start -= 1;
	}

	let end = character;
	while (end < line.length && !isTokenBoundary(characterAt(line, end))) {
		end += 1;
	}

	return {
		start: { line: position.line, character: start },
		end: { line: position.line, character: end },
	};
}
