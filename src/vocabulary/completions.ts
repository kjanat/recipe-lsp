import {
	COMPOUNDING,
	COMPOUNDING_MULTIWORD,
	CONDITIONAL,
	CONDITIONAL_MULTIWORD,
	DISPENSING,
	DISPENSING_MULTIWORD,
	FORMS,
	FORMS_MULTIWORD,
	FREQUENCY,
	ROUTE,
	ROUTE_MULTIWORD,
	TIMING,
	TIMING_MULTIWORD,
	WARNING,
} from "tree-sitter-recipe/grammar/latin";
import { UNITS } from "tree-sitter-recipe/grammar/units";
import { type CompletionItem, CompletionItemKind, InsertTextFormat, MarkupKind } from "vscode-languageserver";

interface CompletionSpec {
	label: string;
	kind: CompletionItemKind;
	detail: string;
	documentation: string;
	insertText?: string;
	insertTextFormat?: InsertTextFormat;
	sortText?: string;
}

function buildCompletion(spec: CompletionSpec): CompletionItem {
	const item: CompletionItem = {
		label: spec.label,
		kind: spec.kind,
		detail: spec.detail,
		documentation: { kind: MarkupKind.Markdown, value: spec.documentation },
	};

	if (spec.insertText !== undefined) {
		item.insertText = spec.insertText;
	}
	if (spec.insertTextFormat !== undefined) {
		item.insertTextFormat = spec.insertTextFormat;
	}
	if (spec.sortText !== undefined) {
		item.sortText = spec.sortText;
	}

	return item;
}

function vocabCompletion(
	label: string,
	detail: string,
	documentation: string,
	kind: CompletionItemKind,
): CompletionItem {
	return buildCompletion({ label, detail, documentation, kind });
}

function groupCompletions(
	labels: readonly string[],
	detail: string,
	documentation: string,
	kind: CompletionItemKind,
): CompletionItem[] {
	return labels.map((label) => vocabCompletion(label, detail, documentation, kind));
}

const RECIPE_SNIPPET: string = String.raw`R/ \${1:ingredient} \${2:dose}
Da/ \${3:dispense}
S/ \${0:directions}`;

const KEYWORD_ENTRIES: ReadonlyArray<{ label: string; detail: string; doc: string }> = [
	{ label: "R/", detail: "Recipe marker", doc: "Start the ingredient section." },
	{ label: "Da/", detail: "Dispense marker", doc: "Start the dispense section." },
	{
		label: "D/",
		detail: "Dispense marker",
		doc: "Short form of the dispense section marker.",
	},
	{ label: "S/", detail: "Signa marker", doc: "Start the patient directions section." },
	{
		label: "ad",
		detail: "Fill-to marker",
		doc: "Use in fill-to-total directives like `ad 100 g`.",
	},
	{
		label: "dtd",
		detail: "Dispense-count directive",
		doc: "Use for dispense counts like `dtd no 21`.",
	},
	{
		label: "d.t.d.",
		detail: "Dispense-count directive",
		doc: "Dotted form of the dispense-count directive.",
	},
	{
		label: "no",
		detail: "Dispense-count literal",
		doc: "Literal used inside `dtd` directives.",
	},
];

const COMPACT_FREQUENCY_LABELS = ["1 dd", "2 dd", "3 dd", "4 dd"];

const STATIC_COMPLETIONS: CompletionItem[] = [
	buildCompletion({
		label: "recipe block",
		kind: CompletionItemKind.Snippet,
		detail: "Insert a full recipe block",
		documentation: "Insert `R/`, `Da/`, and `S/` sections.",
		insertText: RECIPE_SNIPPET,
		insertTextFormat: InsertTextFormat.Snippet,
		sortText: "0000",
	}),
	...KEYWORD_ENTRIES.map((entry) => vocabCompletion(entry.label, entry.detail, entry.doc, CompletionItemKind.Keyword)),
	...COMPACT_FREQUENCY_LABELS.map((label) =>
		vocabCompletion(label, "Compact frequency", "Compact frequency form.", CompletionItemKind.Value)
	),
];

const VOCAB_COMPLETIONS: CompletionItem[] = [
	...groupCompletions(
		FREQUENCY,
		"Frequency abbreviation",
		"Recognized Latin-style frequency abbreviation.",
		CompletionItemKind.Value,
	),
	...groupCompletions(
		[...TIMING_MULTIWORD, ...TIMING],
		"Timing abbreviation",
		"Recognized timing abbreviation.",
		CompletionItemKind.Value,
	),
	...groupCompletions(
		[...ROUTE_MULTIWORD, ...ROUTE],
		"Route abbreviation",
		"Recognized administration-route abbreviation.",
		CompletionItemKind.Function,
	),
	...groupCompletions(
		[...DISPENSING_MULTIWORD, ...DISPENSING],
		"Dispensing abbreviation",
		"Recognized pharmacist dispensing abbreviation.",
		CompletionItemKind.Value,
	),
	...groupCompletions(
		WARNING,
		"Warning abbreviation",
		"Recognized warning abbreviation.",
		CompletionItemKind.Constant,
	),
	...groupCompletions(
		[...FORMS_MULTIWORD, ...FORMS],
		"Form abbreviation",
		"Recognized dosage-form abbreviation.",
		CompletionItemKind.Class,
	),
	...groupCompletions(
		[...COMPOUNDING_MULTIWORD, ...COMPOUNDING],
		"Compounding abbreviation",
		"Recognized compounding abbreviation.",
		CompletionItemKind.Operator,
	),
	...groupCompletions(
		[...CONDITIONAL_MULTIWORD, ...CONDITIONAL],
		"Conditional abbreviation",
		"Recognized conditional abbreviation.",
		CompletionItemKind.Keyword,
	),
	...groupCompletions(UNITS, "Dose unit", "Recognized recipe dose unit.", CompletionItemKind.Unit),
];

function dedupeByLabel(items: CompletionItem[]): CompletionItem[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		if (seen.has(item.label)) {
			return false;
		}
		seen.add(item.label);
		return true;
	});
}

const ALL_COMPLETIONS = dedupeByLabel([...STATIC_COMPLETIONS, ...VOCAB_COMPLETIONS]);

export function completionItems(): CompletionItem[] {
	return ALL_COMPLETIONS;
}
