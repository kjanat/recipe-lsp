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
import { ACTIVITY, COUNTABLE, MASS, RATE, UNITS, VOLUME } from "tree-sitter-recipe/grammar/units";
import { type CompletionItem, CompletionItemKind, InsertTextFormat, MarkupKind } from "vscode-languageserver/node";

type HoverInfo = {
	title: string;
	detail: string;
};

type CompletionSpec = {
	label: string;
	kind: CompletionItemKind;
	detail: string;
	documentation: string;
	insertText?: string;
	insertTextFormat?: InsertTextFormat;
	sortText?: string;
};

function createCompletion(spec: CompletionSpec): CompletionItem {
	const item: CompletionItem = {
		label: spec.label,
		kind: spec.kind,
		detail: spec.detail,
		documentation: {
			kind: MarkupKind.Markdown,
			value: spec.documentation,
		},
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

function createVocabularyCompletion(
	label: string,
	detail: string,
	documentation: string,
	kind: CompletionItemKind,
): CompletionItem {
	return createCompletion({ label, detail, documentation, kind });
}

function createGroupCompletions(
	labels: readonly string[],
	detail: string,
	documentation: string,
	kind: CompletionItemKind,
): CompletionItem[] {
	return labels.map((label) => createVocabularyCompletion(label, detail, documentation, kind));
}

function createUnitHoverInfo(token: string): HoverInfo {
	if (RATE.some((label) => label === token)) {
		return {
			title: "Rate unit",
			detail: "Recognized as a rate-based dose unit.",
		};
	}

	if (MASS.some((label) => label === token)) {
		return {
			title: "Mass unit",
			detail: "Recognized as a mass dose unit.",
		};
	}

	if (VOLUME.some((label) => label === token)) {
		return {
			title: "Volume unit",
			detail: "Recognized as a volume dose unit.",
		};
	}

	if (ACTIVITY.some((label) => label === token)) {
		return {
			title: "Activity unit",
			detail: "Recognized as a biological activity dose unit.",
		};
	}

	if (COUNTABLE.some((label) => label === token)) {
		return {
			title: "Countable unit",
			detail: "Recognized as a discrete count-based unit.",
		};
	}

	return {
		title: "Dose unit",
		detail: "Recognized as a valid recipe dose unit.",
	};
}

const NODE_HOVER_INFO = new Map<string, HoverInfo>([
	[
		"rx_marker",
		{ title: "Recipe marker", detail: "Starts the ingredient section (`R/`)." },
	],
	[
		"dispense_marker",
		{
			title: "Dispense marker",
			detail: "Starts the pharmacist dispense section (`Da/` or `D/`).",
		},
	],
	[
		"signa_marker",
		{
			title: "Signa marker",
			detail: "Starts the patient directions section (`S/`).",
		},
	],
	[
		"frequency",
		{
			title: "Compact frequency",
			detail: "Recognized compact dosing frequency like `1 dd` or `3dd`.",
		},
	],
	[
		"frequency_abbrev",
		{
			title: "Frequency abbreviation",
			detail: "Recognized Latin-style frequency abbreviation.",
		},
	],
	[
		"timing_abbrev",
		{ title: "Timing abbreviation", detail: "Recognized timing abbreviation." },
	],
	[
		"route_abbrev",
		{
			title: "Route abbreviation",
			detail: "Recognized administration-route abbreviation.",
		},
	],
	[
		"dispensing_abbrev",
		{
			title: "Dispensing abbreviation",
			detail: "Recognized pharmacist dispensing abbreviation.",
		},
	],
	[
		"warning_abbrev",
		{
			title: "Warning abbreviation",
			detail: "Recognized warning abbreviation.",
		},
	],
	[
		"form_abbrev",
		{
			title: "Form abbreviation",
			detail: "Recognized dosage-form abbreviation.",
		},
	],
	[
		"compounding_abbrev",
		{
			title: "Compounding abbreviation",
			detail: "Recognized compounding abbreviation.",
		},
	],
	[
		"conditional_abbrev",
		{
			title: "Conditional abbreviation",
			detail: "Recognized conditional abbreviation.",
		},
	],
	[
		"fill_marker",
		{
			title: "Fill-to marker",
			detail: "`ad` marker used in fill-to-total directives like `ad 100 g`.",
		},
	],
	[
		"dtd_keyword",
		{
			title: "Dispense-count directive",
			detail: "`dtd` / `d.t.d.` directive for dispense counts.",
		},
	],
	[
		"dtd_no",
		{
			title: "Dispense-count literal",
			detail: "Literal `no` inside a `dtd` directive.",
		},
	],
	[
		"dose",
		{ title: "Dose", detail: "A parsed dose made of a number and a unit." },
	],
]);

const STATIC_COMPLETIONS: CompletionItem[] = [
	createCompletion({
		label: "recipe block",
		kind: CompletionItemKind.Snippet,
		detail: "Insert a full recipe block",
		documentation: "Insert `R/`, `Da/`, and `S/` sections.",
		insertText: String.raw`R/ \${1:ingredient} \${2:dose}
Da/ \${3:dispense}
S/ \${0:directions}`,
		insertTextFormat: InsertTextFormat.Snippet,
		sortText: "0000",
	}),
	createVocabularyCompletion(
		"R/",
		"Recipe marker",
		"Start the ingredient section.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"Da/",
		"Dispense marker",
		"Start the dispense section.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"D/",
		"Dispense marker",
		"Short form of the dispense section marker.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"S/",
		"Signa marker",
		"Start the patient directions section.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"ad",
		"Fill-to marker",
		"Use in fill-to-total directives like `ad 100 g`.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"dtd",
		"Dispense-count directive",
		"Use for dispense counts like `dtd no 21`.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"d.t.d.",
		"Dispense-count directive",
		"Dotted form of the dispense-count directive.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"no",
		"Dispense-count literal",
		"Literal used inside `dtd` directives.",
		CompletionItemKind.Keyword,
	),
	createVocabularyCompletion(
		"1 dd",
		"Compact frequency",
		"Compact frequency form.",
		CompletionItemKind.Value,
	),
	createVocabularyCompletion(
		"2 dd",
		"Compact frequency",
		"Compact frequency form.",
		CompletionItemKind.Value,
	),
	createVocabularyCompletion(
		"3 dd",
		"Compact frequency",
		"Compact frequency form.",
		CompletionItemKind.Value,
	),
	createVocabularyCompletion(
		"4 dd",
		"Compact frequency",
		"Compact frequency form.",
		CompletionItemKind.Value,
	),
];

const VOCAB_COMPLETIONS: CompletionItem[] = [
	...createGroupCompletions(
		FREQUENCY,
		"Frequency abbreviation",
		"Recognized Latin-style frequency abbreviation.",
		CompletionItemKind.Value,
	),
	...createGroupCompletions(
		[...TIMING_MULTIWORD, ...TIMING],
		"Timing abbreviation",
		"Recognized timing abbreviation.",
		CompletionItemKind.Value,
	),
	...createGroupCompletions(
		[...ROUTE_MULTIWORD, ...ROUTE],
		"Route abbreviation",
		"Recognized administration-route abbreviation.",
		CompletionItemKind.Function,
	),
	...createGroupCompletions(
		[...DISPENSING_MULTIWORD, ...DISPENSING],
		"Dispensing abbreviation",
		"Recognized pharmacist dispensing abbreviation.",
		CompletionItemKind.Value,
	),
	...createGroupCompletions(
		WARNING,
		"Warning abbreviation",
		"Recognized warning abbreviation.",
		CompletionItemKind.Constant,
	),
	...createGroupCompletions(
		[...FORMS_MULTIWORD, ...FORMS],
		"Form abbreviation",
		"Recognized dosage-form abbreviation.",
		CompletionItemKind.Class,
	),
	...createGroupCompletions(
		[...COMPOUNDING_MULTIWORD, ...COMPOUNDING],
		"Compounding abbreviation",
		"Recognized compounding abbreviation.",
		CompletionItemKind.Operator,
	),
	...createGroupCompletions(
		[...CONDITIONAL_MULTIWORD, ...CONDITIONAL],
		"Conditional abbreviation",
		"Recognized conditional abbreviation.",
		CompletionItemKind.Keyword,
	),
	...createGroupCompletions(
		UNITS,
		"Dose unit",
		"Recognized recipe dose unit.",
		CompletionItemKind.Unit,
	),
];

const seenCompletionLabels = new Set<string>();
const allCompletions: CompletionItem[] = [];
for (const item of [...STATIC_COMPLETIONS, ...VOCAB_COMPLETIONS]) {
	if (seenCompletionLabels.has(item.label)) {
		continue;
	}

	seenCompletionLabels.add(item.label);
	allCompletions.push(item);
}

export function hoverInfoForNode(
	nodeType: string,
	token: string,
): HoverInfo | null {
	if (nodeType === "unit") {
		return createUnitHoverInfo(token);
	}

	return NODE_HOVER_INFO.get(nodeType) ?? null;
}

export function completionItems(): CompletionItem[] {
	return allCompletions;
}
