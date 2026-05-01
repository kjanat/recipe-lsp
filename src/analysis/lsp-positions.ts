import type { Position, Range } from "vscode-languageserver";
import type { Node, Point } from "web-tree-sitter";

const LINE_SPLIT = /\r?\n/u;

const UTF8_2BYTE_START = 0x80;
const UTF8_3BYTE_START = 0x8_00;
const UTF8_4BYTE_START = 0x1_00_00;

const UTF8_BYTES_1 = 1;
const UTF8_BYTES_2 = 2;
const UTF8_BYTES_3 = 3;
const UTF8_BYTES_4 = 4;

function utf8ByteLength(codePoint: string): number {
	const cp = codePoint.codePointAt(0) ?? 0;
	if (cp < UTF8_2BYTE_START) {
		return UTF8_BYTES_1;
	}
	if (cp < UTF8_3BYTE_START) {
		return UTF8_BYTES_2;
	}
	if (cp < UTF8_4BYTE_START) {
		return UTF8_BYTES_3;
	}
	return UTF8_BYTES_4;
}

function clampLine(lines: string[], line: number): string {
	return lines[Math.max(0, Math.min(line, Math.max(lines.length - 1, 0)))] ?? "";
}

export function splitLines(text: string): string[] {
	return text.split(LINE_SPLIT);
}

export function firstLineOf(text: string): string {
	return text.split(LINE_SPLIT, 1)[0] ?? "";
}

export function byteColumnToCharacter(line: string, byteColumn: number): number {
	let bytes = 0;
	let character = 0;

	for (const chunk of line) {
		if (bytes >= byteColumn) {
			return character;
		}

		bytes += utf8ByteLength(chunk);
		character += chunk.length;
	}

	return character;
}

export function characterToByteColumn(line: string, character: number): number {
	let bytes = 0;
	let consumed = 0;

	for (const chunk of line) {
		if (consumed >= character) {
			return bytes;
		}

		bytes += utf8ByteLength(chunk);
		consumed += chunk.length;
	}

	return bytes;
}

export function toPosition(lines: string[], point: Point): Position {
	const line = clampLine(lines, point.row);
	return {
		line: point.row,
		character: byteColumnToCharacter(line, point.column),
	};
}

export function toPoint(lines: string[], position: Position): Point {
	const line = clampLine(lines, position.line);
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
