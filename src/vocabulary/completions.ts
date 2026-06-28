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

import { glossFor } from "./glossary.ts";

/** The recipe section a completion request lands in, or `top-level` between sections. */
export type CompletionSection = "top-level" | "rx" | "dispense" | "signa";

export interface CompletionContext {
	section: CompletionSection;
	/** The token just left of the cursor is a bare dose number, so a unit comes next. */
	afterNumber: boolean;
	/** Only whitespace precedes the cursor on its line, so a new section marker may start here. */
	atLineStart: boolean;
}

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
	// When the token has a known meaning, surface the Latin expansion inline and
	// the Dutch gloss in the docs, keeping the category as a subordinate label.
	const gloss = glossFor(label);
	if (gloss) {
		return buildCompletion({
			label,
			detail: gloss.latin,
			documentation: `${gloss.nl}\n\n*${detail}*`,
			kind,
		});
	}
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

const RECIPE_SNIPPET: string = String.raw`R/ \${1:ingredient} \${2:dose}
Da/ \${3:dispense}
S/ \${0:directions}`;

interface LabelledEntry {
	label: string;
	detail: string;
	doc: string;
}

const MARKER_ENTRIES: readonly LabelledEntry[] = [
	{ label: "R/", detail: "Recipe marker", doc: "Start the ingredient section." },
	{ label: "Da/", detail: "Dispense marker", doc: "Start the dispense section." },
	{ label: "D/", detail: "Dispense marker", doc: "Short form of the dispense section marker." },
	{ label: "S/", detail: "Signa marker", doc: "Start the patient directions section." },
];

const DIRECTIVE_ENTRIES: readonly LabelledEntry[] = [
	{ label: "ad", detail: "Fill-to marker", doc: "Use in fill-to-total directives like `ad 100 g`." },
	{ label: "dtd", detail: "Dispense-count directive", doc: "Use for dispense counts like `dtd no 21`." },
	{ label: "d.t.d.", detail: "Dispense-count directive", doc: "Dotted form of the dispense-count directive." },
	{ label: "no", detail: "Dispense-count literal", doc: "Literal used inside `dtd` directives." },
];

const COMPACT_FREQUENCY_LABELS = ["1 dd", "2 dd", "3 dd", "4 dd"];

const RECIPE_BLOCK_COMPLETION: CompletionItem = buildCompletion({
	label: "recipe block",
	kind: CompletionItemKind.Snippet,
	detail: "Insert a full recipe block",
	documentation: "Insert `R/`, `Da/`, and `S/` sections.",
	insertText: RECIPE_SNIPPET,
	insertTextFormat: InsertTextFormat.Snippet,
	sortText: "0000",
});

function entryCompletions(entries: readonly LabelledEntry[]): CompletionItem[] {
	return entries.map((entry) => vocabCompletion(entry.label, entry.detail, entry.doc, CompletionItemKind.Keyword));
}

const MARKER_COMPLETIONS: CompletionItem[] = [RECIPE_BLOCK_COMPLETION, ...entryCompletions(MARKER_ENTRIES)];
const DIRECTIVE_COMPLETIONS: CompletionItem[] = entryCompletions(DIRECTIVE_ENTRIES);

const FREQUENCY_COMPLETIONS: CompletionItem[] = [
	...COMPACT_FREQUENCY_LABELS.map((label) =>
		vocabCompletion(label, "Compact frequency", "Compact frequency form.", CompletionItemKind.Value)
	),
	...groupCompletions(
		FREQUENCY,
		"Frequency abbreviation",
		"Recognized Latin-style frequency abbreviation.",
		CompletionItemKind.Value,
	),
];

const TIMING_COMPLETIONS = groupCompletions(
	[...TIMING_MULTIWORD, ...TIMING],
	"Timing abbreviation",
	"Recognized timing abbreviation.",
	CompletionItemKind.Value,
);

const ROUTE_COMPLETIONS = groupCompletions(
	[...ROUTE_MULTIWORD, ...ROUTE],
	"Route abbreviation",
	"Recognized administration-route abbreviation.",
	CompletionItemKind.Function,
);

const DISPENSING_COMPLETIONS = groupCompletions(
	[...DISPENSING_MULTIWORD, ...DISPENSING],
	"Dispensing abbreviation",
	"Recognized pharmacist dispensing abbreviation.",
	CompletionItemKind.Value,
);

const WARNING_COMPLETIONS = groupCompletions(
	WARNING,
	"Warning abbreviation",
	"Recognized warning abbreviation.",
	CompletionItemKind.Constant,
);

const FORM_COMPLETIONS = groupCompletions(
	[...FORMS_MULTIWORD, ...FORMS],
	"Form abbreviation",
	"Recognized dosage-form abbreviation.",
	CompletionItemKind.Class,
);

const COMPOUNDING_COMPLETIONS = groupCompletions(
	[...COMPOUNDING_MULTIWORD, ...COMPOUNDING],
	"Compounding abbreviation",
	"Recognized compounding abbreviation.",
	CompletionItemKind.Operator,
);

const CONDITIONAL_COMPLETIONS = groupCompletions(
	[...CONDITIONAL_MULTIWORD, ...CONDITIONAL],
	"Conditional abbreviation",
	"Recognized conditional abbreviation.",
	CompletionItemKind.Keyword,
);

const UNIT_COMPLETIONS = groupCompletions(UNITS, "Dose unit", "Recognized recipe dose unit.", CompletionItemKind.Unit);

// Ingredient lines name a drug then dose it; offer forms, units, compounding, route, and dtd/ad directives.
const RX_COMPLETIONS = dedupeByLabel([
	...FORM_COMPLETIONS,
	...UNIT_COMPLETIONS,
	...COMPOUNDING_COMPLETIONS,
	...ROUTE_COMPLETIONS,
	...CONDITIONAL_COMPLETIONS,
	...DIRECTIVE_COMPLETIONS,
]);

// Dispense bodies state a count and form; offer units, forms, dispensing abbreviations, and dtd/no.
const DISPENSE_COMPLETIONS = dedupeByLabel([
	...UNIT_COMPLETIONS,
	...FORM_COMPLETIONS,
	...DISPENSING_COMPLETIONS,
	...DIRECTIVE_COMPLETIONS,
]);

// Signa lines are patient directions; offer frequency, timing, route, conditional, warning, dispensing, units.
const SIGNA_COMPLETIONS = dedupeByLabel([
	...FREQUENCY_COMPLETIONS,
	...TIMING_COMPLETIONS,
	...ROUTE_COMPLETIONS,
	...CONDITIONAL_COMPLETIONS,
	...WARNING_COMPLETIONS,
	...DISPENSING_COMPLETIONS,
	...UNIT_COMPLETIONS,
	...COMPOUNDING_COMPLETIONS,
]);

const SECTION_COMPLETIONS: Record<Exclude<CompletionSection, "top-level">, CompletionItem[]> = {
	rx: RX_COMPLETIONS,
	dispense: DISPENSE_COMPLETIONS,
	signa: SIGNA_COMPLETIONS,
};

const ALL_COMPLETIONS = dedupeByLabel([
	...MARKER_COMPLETIONS,
	...DIRECTIVE_COMPLETIONS,
	...FREQUENCY_COMPLETIONS,
	...TIMING_COMPLETIONS,
	...ROUTE_COMPLETIONS,
	...DISPENSING_COMPLETIONS,
	...WARNING_COMPLETIONS,
	...FORM_COMPLETIONS,
	...COMPOUNDING_COMPLETIONS,
	...CONDITIONAL_COMPLETIONS,
	...UNIT_COMPLETIONS,
]);

/** Completions tailored to a parse-tree context: section vocabulary, units-first after a dose number. */
export function completionsForContext(context: CompletionContext): CompletionItem[] {
	if (context.section === "top-level") {
		return MARKER_COMPLETIONS;
	}

	const section = SECTION_COMPLETIONS[context.section];
	const base = context.afterNumber ? dedupeByLabel([...UNIT_COMPLETIONS, ...section]) : section;
	if (context.atLineStart) {
		return dedupeByLabel([...MARKER_COMPLETIONS, ...base]);
	}
	return base;
}

/** The full, context-free vocabulary. Used as a fallback when no document is available. */
export function completionItems(): CompletionItem[] {
	return ALL_COMPLETIONS;
}
