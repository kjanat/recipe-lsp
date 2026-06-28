import type { RecipeAnalyzer } from "#anal/recipe-analyzer.ts";
import { createLspTestHarness, type LspTestHarness } from "#testsupport/lsp-harness.ts";
import { describe, expect, mock, test } from "bun:test";
import type { NotificationMessage, ResponseMessage } from "vscode-jsonrpc";
import type {
	DocumentSymbol,
	FoldingRange,
	Hover,
	InitializeResult,
	PublishDiagnosticsParams,
	SelectionRange,
	SemanticTokens,
} from "vscode-languageserver";

mock.restore();

const nodeAnalyzerModule: typeof import("#runtime/node-analyzer.ts") = await import(
	"#runtime/node-analyzer.ts"
);
const getNodeRecipeAnalyzer: typeof nodeAnalyzerModule.getNodeRecipeAnalyzer = nodeAnalyzerModule.getNodeRecipeAnalyzer;

const PUBLISH_DIAGNOSTICS = "textDocument/publishDiagnostics";
const LOG_MESSAGE = "window/logMessage";

const REQUEST_INITIALIZE = 100;
const REQUEST_DOCUMENT_SYMBOL = 110;
const REQUEST_DOCUMENT_SYMBOL_MISSING = 111;
const REQUEST_HOVER = 120;
const REQUEST_HOVER_MISSING = 121;
const REQUEST_COMPLETION = 130;
const REQUEST_COMPLETION_CONTEXT = 131;
const REQUEST_FOLDING_RANGE = 140;
const REQUEST_SELECTION_RANGE = 150;
const REQUEST_SELECTION_RANGE_MISSING = 151;
const REQUEST_SEMANTIC_TOKENS = 160;
const REQUEST_SEMANTIC_TOKENS_MISSING = 161;

const VALID_RECIPE = "R/ a 1mg\nS/ take 1";
const SECTION_ORDER_BAD_RECIPE = "S/ take 1\nR/ a 1mg";

function publishParams(notification: NotificationMessage): PublishDiagnosticsParams {
	const { params } = notification;
	if (
		typeof params !== "object"
		|| params === null
		|| !("uri" in params)
		|| !("diagnostics" in params)
	) {
		throw new Error("expected publishDiagnostics params");
	}
	const { uri, diagnostics } = params;
	if (typeof uri !== "string" || !Array.isArray(diagnostics)) {
		throw new Error("malformed publishDiagnostics params");
	}
	return { uri, diagnostics };
}

function logMessageText(notification: NotificationMessage): string {
	const { params } = notification;
	if (
		typeof params !== "object"
		|| params === null
		|| !("message" in params)
		|| typeof params.message !== "string"
	) {
		throw new Error("expected logMessage params");
	}
	return params.message;
}

function initializeCapabilities(response: ResponseMessage): InitializeResult["capabilities"] {
	const { result } = response;
	if (typeof result !== "object" || result === null || !("capabilities" in result)) {
		throw new Error("expected initialize result");
	}
	const { capabilities } = result;
	if (typeof capabilities !== "object" || capabilities === null) {
		throw new Error("expected initialize capabilities");
	}
	return capabilities as InitializeResult["capabilities"];
}

function symbolsResult(response: ResponseMessage): DocumentSymbol[] {
	if (!Array.isArray(response.result)) {
		throw new Error("expected document symbol result");
	}
	return response.result;
}

function hoverResult(response: ResponseMessage): Hover | null {
	const { result } = response;
	if (result === null) {
		return null;
	}
	if (typeof result !== "object" || !("contents" in result)) {
		throw new Error("expected hover result");
	}
	return result as Hover;
}

function completionLabels(response: ResponseMessage): unknown[] {
	if (!Array.isArray(response.result)) {
		throw new Error("expected completion result");
	}
	const labels: unknown[] = [];
	for (const item of response.result) {
		if (typeof item === "object" && item !== null && "label" in item) {
			labels.push(item.label);
		}
	}
	return labels;
}

function foldingRangesResult(response: ResponseMessage): FoldingRange[] {
	if (!Array.isArray(response.result)) {
		throw new Error("expected folding range result");
	}
	return response.result;
}

function selectionRangesResult(response: ResponseMessage): SelectionRange[] {
	if (!Array.isArray(response.result)) {
		throw new Error("expected selection range result");
	}
	return response.result;
}

function semanticTokensResult(response: ResponseMessage): SemanticTokens {
	const { result } = response;
	if (
		typeof result !== "object"
		|| result === null
		|| !("data" in result)
		|| !Array.isArray(result.data)
	) {
		throw new Error("expected semantic tokens result");
	}
	return result as SemanticTokens;
}

async function nextDiagnosticsFor(
	harness: LspTestHarness,
	uri: string,
	after: number,
): Promise<PublishDiagnosticsParams> {
	const notification = await harness.awaitNotification(PUBLISH_DIAGNOSTICS, { after });
	const params = publishParams(notification);
	if (params.uri === uri) {
		return params;
	}
	const nextStart = harness.allMessages().indexOf(notification) + 1;
	return nextDiagnosticsFor(harness, uri, nextStart);
}

describe("startRecipeServer initialization", () => {
	test("responds to initialize with server capabilities", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		h.request(REQUEST_INITIALIZE, "initialize", {
			processId: 0,
			capabilities: {},
			rootUri: null,
		});
		const response = await h.awaitResponse(REQUEST_INITIALIZE);
		expect(initializeCapabilities(response)).toMatchObject({
			documentSymbolProvider: true,
			hoverProvider: true,
			foldingRangeProvider: true,
			selectionRangeProvider: true,
		});
		expect(initializeCapabilities(response)).toHaveProperty("semanticTokensProvider.legend.tokenTypes");
	});

	test("logs ready on initialized notification", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		h.request(REQUEST_INITIALIZE, "initialize", {
			processId: 0,
			capabilities: {},
			rootUri: null,
		});
		await h.awaitResponse(REQUEST_INITIALIZE);
		h.notify("initialized", {});
		const log = await h.awaitNotification(LOG_MESSAGE);
		expect(logMessageText(log)).toContain("recipe-lsp");
	});
});

describe("startRecipeServer document lifecycle", () => {
	test("publishes empty diagnostics for a valid document on open", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///valid.recipe";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: VALID_RECIPE },
		});
		const params = await nextDiagnosticsFor(h, uri, before);
		expect(params.diagnostics).toHaveLength(0);
	});

	test("publishes section-order warnings on open", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///bad.recipe";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: SECTION_ORDER_BAD_RECIPE },
		});
		const params = await nextDiagnosticsFor(h, uri, before);
		expect(params.diagnostics.length).toBeGreaterThan(0);
	});

	test("re-publishes diagnostics on document change", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///change.recipe";
		const openCursor = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: "R/ a 1mg" },
		});
		await nextDiagnosticsFor(h, uri, openCursor);

		const changeCursor = h.cursor();
		h.notify("textDocument/didChange", {
			textDocument: { uri, version: 2 },
			contentChanges: [{ text: SECTION_ORDER_BAD_RECIPE }],
		});
		const after = await nextDiagnosticsFor(h, uri, changeCursor);
		expect(after.diagnostics.length).toBeGreaterThan(0);
	});

	test("clears diagnostics on document close", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///close.recipe";
		const openCursor = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: "R/ a 1mg" },
		});
		await nextDiagnosticsFor(h, uri, openCursor);

		const closeCursor = h.cursor();
		h.notify("textDocument/didClose", { textDocument: { uri } });
		const after = await nextDiagnosticsFor(h, uri, closeCursor);
		expect(after.diagnostics).toHaveLength(0);
	});
});

describe("startRecipeServer requests", () => {
	test("answers documentSymbol requests with section symbols", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///sym.recipe";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: VALID_RECIPE },
		});
		await nextDiagnosticsFor(h, uri, before);

		h.request(REQUEST_DOCUMENT_SYMBOL, "textDocument/documentSymbol", {
			textDocument: { uri },
		});
		const response = await h.awaitResponse(REQUEST_DOCUMENT_SYMBOL);
		expect(symbolsResult(response).length).toBeGreaterThanOrEqual(2);
	});

	test("returns empty document symbols for an unknown document", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		h.request(REQUEST_DOCUMENT_SYMBOL_MISSING, "textDocument/documentSymbol", {
			textDocument: { uri: "file:///missing.recipe" },
		});
		const response = await h.awaitResponse(REQUEST_DOCUMENT_SYMBOL_MISSING);
		expect(symbolsResult(response)).toEqual([]);
	});

	test("answers hover requests with markdown content", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///hover.recipe";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: "S/ vóór p.o." },
		});
		await nextDiagnosticsFor(h, uri, before);

		h.request(REQUEST_HOVER, "textDocument/hover", {
			textDocument: { uri },
			position: { line: 0, character: 8 },
		});
		const response = await h.awaitResponse(REQUEST_HOVER);
		const hover = hoverResult(response);
		if (!hover) {
			throw new Error("expected hover content");
		}
		expect(JSON.stringify(hover.contents)).toContain("Route abbreviation");
	});

	test("returns null hover for an unknown document", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		h.request(REQUEST_HOVER_MISSING, "textDocument/hover", {
			textDocument: { uri: "file:///nohover.recipe" },
			position: { line: 0, character: 0 },
		});
		const response = await h.awaitResponse(REQUEST_HOVER_MISSING);
		expect(hoverResult(response)).toBeNull();
	});
});

describe("startRecipeServer completion", () => {
	test("falls back to the full vocabulary for an unopened document", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		h.request(REQUEST_COMPLETION, "textDocument/completion", {
			textDocument: { uri: "file:///c.recipe" },
			position: { line: 0, character: 0 },
		});
		const response = await h.awaitResponse(REQUEST_COMPLETION);
		const labels = completionLabels(response);
		expect(labels).toContain("R/");
		expect(labels).toContain("mg");
	});

	test("tailors completions to the parse context of an open document", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///ctx.recipe";
		const source = "R/ amoxicilline 500 ";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: source },
		});
		await nextDiagnosticsFor(h, uri, before);

		h.request(REQUEST_COMPLETION_CONTEXT, "textDocument/completion", {
			textDocument: { uri },
			position: { line: 0, character: source.length },
		});
		const response = await h.awaitResponse(REQUEST_COMPLETION_CONTEXT);
		const labels = completionLabels(response);
		// Right after a dose number: units are offered, bare section markers are not.
		expect(labels).toContain("mg");
		expect(labels).not.toContain("R/");
	});
});

describe("startRecipeServer single-document extras", () => {
	test("answers folding range requests", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///fold.recipe";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: "R/ a 1mg\nb 2mg\nS/ take 1" },
		});
		await nextDiagnosticsFor(h, uri, before);

		h.request(REQUEST_FOLDING_RANGE, "textDocument/foldingRange", {
			textDocument: { uri },
		});
		const response = await h.awaitResponse(REQUEST_FOLDING_RANGE);
		expect(foldingRangesResult(response)).toContainEqual({
			startLine: 0,
			endLine: 1,
			kind: "region",
		});
	});

	test("answers selection range requests", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///select.recipe";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: "R/ amoxicilline 500mg\nS/ take 1" },
		});
		await nextDiagnosticsFor(h, uri, before);

		h.request(REQUEST_SELECTION_RANGE, "textDocument/selectionRange", {
			textDocument: { uri },
			positions: [{ line: 0, character: 6 }],
		});
		const response = await h.awaitResponse(REQUEST_SELECTION_RANGE);
		const [selection] = selectionRangesResult(response);
		expect(selection?.range).toEqual({
			start: { line: 0, character: 3 },
			end: { line: 0, character: 15 },
		});
		expect(selection?.parent?.range).toEqual({
			start: { line: 0, character: 3 },
			end: { line: 0, character: 21 },
		});
	});

	test("returns empty selection ranges for an unknown document", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		h.request(REQUEST_SELECTION_RANGE_MISSING, "textDocument/selectionRange", {
			textDocument: { uri: "file:///missing-select.recipe" },
			positions: [{ line: 0, character: 0 }],
		});
		const response = await h.awaitResponse(REQUEST_SELECTION_RANGE_MISSING);
		expect(selectionRangesResult(response)).toEqual([]);
	});

	test("answers semantic token requests", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		const uri = "file:///semantic.recipe";
		const before = h.cursor();
		h.notify("textDocument/didOpen", {
			textDocument: { uri, languageId: "recipe", version: 1, text: "S/ take p.o." },
		});
		await nextDiagnosticsFor(h, uri, before);

		h.request(REQUEST_SEMANTIC_TOKENS, "textDocument/semanticTokens/full", {
			textDocument: { uri },
		});
		const response = await h.awaitResponse(REQUEST_SEMANTIC_TOKENS);
		const tokens = semanticTokensResult(response);
		expect(tokens.data.length).toBeGreaterThan(0);
		expect(tokens.data.length % 5).toBe(0);
	});

	test("returns empty semantic tokens for an unknown document", async () => {
		const h = createLspTestHarness(getNodeRecipeAnalyzer);
		h.request(REQUEST_SEMANTIC_TOKENS_MISSING, "textDocument/semanticTokens/full", {
			textDocument: { uri: "file:///missing-semantic.recipe" },
		});
		const response = await h.awaitResponse(REQUEST_SEMANTIC_TOKENS_MISSING);
		expect(semanticTokensResult(response)).toEqual({ data: [] });
	});
});

describe("startRecipeServer error reporting", () => {
	test("logs an error when the analyzer factory rejects with an Error", async () => {
		const failing: () => Promise<RecipeAnalyzer> = () => Promise.reject(new Error("analyzer unavailable"));
		const h = createLspTestHarness(failing);
		h.notify("textDocument/didOpen", {
			textDocument: {
				uri: "file:///fail.recipe",
				languageId: "recipe",
				version: 1,
				text: "R/ a 1mg",
			},
		});
		const log = await h.awaitErrorLog();
		expect(logMessageText(log)).toContain("analyzer unavailable");
	});

	test("formats non-Error rejections via String() in the log", async () => {
		const failing: () => Promise<RecipeAnalyzer> = () => Promise.reject("plain string failure");
		const h = createLspTestHarness(failing);
		h.notify("textDocument/didOpen", {
			textDocument: {
				uri: "file:///string-fail.recipe",
				languageId: "recipe",
				version: 1,
				text: "R/ a 1mg",
			},
		});
		const log = await h.awaitErrorLog();
		expect(logMessageText(log)).toContain("plain string failure");
	});
});
