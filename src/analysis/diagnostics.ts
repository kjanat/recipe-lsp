import {
	type Diagnostic,
	DiagnosticSeverity,
	type DocumentSymbol,
	type Range,
	SymbolKind,
} from "vscode-languageserver";
import type { Node } from "web-tree-sitter";

import { firstLineOf, toRange } from "./lsp-positions.ts";

const SECTION_TYPES = new Set(["rx_section", "dispense_section", "signa_section"]);

const SNIPPET_MAX_LENGTH = 40;
const SYMBOL_NAME_MAX_LENGTH = 80;

const WHITESPACE_RUN = /\s+/gu;

const DIAGNOSTIC_SOURCE = "recipe-lsp";

type SectionState = "start" | "rx" | "dispense" | "signa";

function humanize(type: string): string {
	return type.replaceAll("_", " ");
}

function collapseWhitespace(text: string): string {
	return text.replace(WHITESPACE_RUN, " ").trim();
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function walk(start: Node, visit: (current: Node) => void): void {
	visit(start);
	for (const child of start.children) {
		walk(child, visit);
	}
}

function diagnosticKey(diagnostic: Diagnostic): string {
	const { start, end } = diagnostic.range;
	return `${start.line}:${start.character}:${end.line}:${end.character}:${diagnostic.message}`;
}

function pushDiagnostic(
	diagnostics: Diagnostic[],
	seen: Set<string>,
	diagnostic: Diagnostic,
): void {
	const key = diagnosticKey(diagnostic);
	if (seen.has(key)) {
		return;
	}

	seen.add(key);
	diagnostics.push(diagnostic);
}

function buildSyntaxDiagnostic(lines: string[], node: Node): Diagnostic {
	const snippet = truncate(collapseWhitespace(node.text), SNIPPET_MAX_LENGTH);
	let suffix = "";
	if (snippet.length > 0) {
		suffix = ` near \`${snippet}\``;
	}
	return {
		severity: DiagnosticSeverity.Error,
		range: toRange(lines, node),
		message: `Unexpected syntax${suffix}`,
		source: DIAGNOSTIC_SOURCE,
	};
}

function warning(range: Range, message: string): Diagnostic {
	return {
		severity: DiagnosticSeverity.Warning,
		range,
		message,
		source: DIAGNOSTIC_SOURCE,
	};
}

function handleRxSection(
	state: SectionState,
	range: Range,
	diagnostics: Diagnostic[],
): SectionState {
	switch (state) {
		case "rx":
		case "dispense":
			diagnostics.push(warning(range, "New R/ starts before previous recipe reached S/."));
			break;
		case "start":
		case "signa":
			break;
		default: {
			const exhaustive: never = state;
			throw new Error(`Unhandled section state: ${String(exhaustive)}`);
		}
	}
	return "rx";
}

function handleDispenseSection(
	state: SectionState,
	range: Range,
	diagnostics: Diagnostic[],
): SectionState {
	switch (state) {
		case "start":
			diagnostics.push(warning(range, "Da/ must follow an R/ section."));
			break;
		case "dispense":
			diagnostics.push(warning(range, "Duplicate Da/ section in same recipe."));
			break;
		case "signa":
			diagnostics.push(
				warning(range, "Da/ after S/ is out of order; start a new recipe with R/."),
			);
			break;
		case "rx":
			break;
		default: {
			const exhaustive: never = state;
			throw new Error(`Unhandled section state: ${String(exhaustive)}`);
		}
	}
	return "dispense";
}

function handleSignaSection(
	state: SectionState,
	range: Range,
	diagnostics: Diagnostic[],
): SectionState {
	switch (state) {
		case "start":
			diagnostics.push(warning(range, "S/ must follow an R/ section."));
			break;
		case "signa":
			diagnostics.push(warning(range, "Duplicate S/ section in same recipe."));
			break;
		case "rx":
		case "dispense":
			break;
		default: {
			const exhaustive: never = state;
			throw new Error(`Unhandled section state: ${String(exhaustive)}`);
		}
	}
	return "signa";
}

function sectionNodes(root: Node): Node[] {
	return root.namedChildren.filter((node) => SECTION_TYPES.has(node.type));
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

export function collectSyntaxDiagnostics(lines: string[], root: Node): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const seen = new Set<string>();

	walk(root, (node) => {
		if (node.isMissing) {
			pushDiagnostic(diagnostics, seen, {
				severity: DiagnosticSeverity.Error,
				range: toRange(lines, node),
				message: `Missing ${humanize(node.type)}`,
				source: DIAGNOSTIC_SOURCE,
			});
			return;
		}

		if (node.isError) {
			pushDiagnostic(diagnostics, seen, buildSyntaxDiagnostic(lines, node));
		}
	});

	return diagnostics;
}

export function collectSectionDiagnostics(lines: string[], root: Node): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	let state: SectionState = "start";

	for (const node of sectionNodes(root)) {
		const marker = node.firstNamedChild ?? node;
		const range = toRange(lines, marker);

		if (node.type === "rx_section") {
			state = handleRxSection(state, range, diagnostics);
		} else if (node.type === "dispense_section") {
			state = handleDispenseSection(state, range, diagnostics);
		} else {
			state = handleSignaSection(state, range, diagnostics);
		}
	}

	return diagnostics;
}

export function buildSymbols(lines: string[], root: Node): DocumentSymbol[] {
	const symbols: DocumentSymbol[] = [];

	for (const node of sectionNodes(root)) {
		const marker = node.firstNamedChild ?? node;
		const detail = sectionDetail(node.type);
		const headline = collapseWhitespace(firstLineOf(node.text)) || detail;
		symbols.push({
			name: truncate(headline, SYMBOL_NAME_MAX_LENGTH),
			detail,
			kind: SymbolKind.Namespace,
			range: toRange(lines, node),
			selectionRange: toRange(lines, marker),
			children: [],
		});
	}

	return symbols;
}
