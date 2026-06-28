import type { RecipeAnalysis, RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

import { MarkupKind, SemanticTokensBuilder, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver";
import type {
	Connection,
	Diagnostic,
	InitializeParams,
	InitializeResult,
	MarkupContent,
	SemanticTokens,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

interface ServerState {
	connection: Connection;
	documents: TextDocuments<TextDocument>;
	analyses: Map<string, { version: number; analysis: RecipeAnalysis }>;
	getAnalyzer: () => Promise<RecipeAnalyzer>;
	/** Set from the client's `textDocument.diagnostic.markupMessageSupport` at initialize.
	 * Only when true may diagnostic messages be sent as MarkupContent (LSP 3.18);
	 * otherwise the spec mandates a plain string and a non-supporting client would
	 * fail to decode the object.	 */
	supportsMarkupDiagnostics: boolean;
}

function errorDetail(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}
	return String(error);
}

function reportError(connection: Connection, message: string, error: unknown): void {
	connection.console.error(`${message}\n${errorDetail(error)}`);
}

async function getAnalysis(state: ServerState, document: TextDocument): Promise<RecipeAnalysis> {
	const cached = state.analyses.get(document.uri);
	if (cached && cached.version === document.version) {
		return cached.analysis;
	}

	const analyzer = await state.getAnalyzer();
	const analysis = analyzer.analyzeRecipe(document.getText());
	state.analyses.set(document.uri, { version: document.version, analysis });
	return analysis;
}

/** Diagnostic messages are authored with Markdown (e.g. a code span around the
 * offending token). Render them as Markdown only for clients that advertised
 * support; otherwise keep the plain string the analyzer produced. */
function asMarkdownMessage(message: string | MarkupContent): MarkupContent {
	const value = typeof message === "string" ? message : message.value;
	return { kind: MarkupKind.Markdown, value };
}

function diagnosticsForClient(state: ServerState, diagnostics: readonly Diagnostic[]): Diagnostic[] {
	if (!state.supportsMarkupDiagnostics) {
		return [...diagnostics];
	}
	return diagnostics.map((diagnostic) => ({ ...diagnostic, message: asMarkdownMessage(diagnostic.message) }));
}

function publishDiagnostics(state: ServerState, document: TextDocument): void {
	(async (): Promise<void> => {
		const analysis = await getAnalysis(state, document);
		state.connection.sendDiagnostics({
			uri: document.uri,
			diagnostics: diagnosticsForClient(state, analysis.diagnostics),
		});
	})().catch((error: unknown) => {
		reportError(state.connection, `Failed to analyze ${document.uri}`, error);
	});
}

function buildSemanticTokens(spans: RecipeAnalysis["semanticTokens"]): SemanticTokens {
	const builder = new SemanticTokensBuilder();
	for (const token of spans) {
		builder.push(
			token.line,
			token.character,
			token.length,
			token.tokenType,
			token.tokenModifiers,
		);
	}
	return builder.build();
}

function emptySemanticTokens(): SemanticTokens {
	return { data: [] };
}

function serverCapabilities(analyzer: RecipeAnalyzer): InitializeResult {
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			documentSymbolProvider: true,
			hoverProvider: true,
			foldingRangeProvider: true,
			selectionRangeProvider: true,
			semanticTokensProvider: {
				full: true,
				legend: {
					tokenTypes: [...analyzer.semanticTokenLegend()],
					tokenModifiers: [],
				},
			},
			completionProvider: {
				/** `/` opens a marker (`R/`, `Da/`). `.` is deliberately NOT a trigger:
				 * abbreviations auto-trigger on letters, and triggering on `.` forces a mid-token re-request
				 * that resets the client's filter (so `p.` would drop `p.c.`).
				 * Letting the open list keep filtering avoids that. */
				triggerCharacters: ["/"],
			},
		},
	};
}

function wireDocumentEvents(state: ServerState): void {
	state.documents.onDidOpen((event) => {
		publishDiagnostics(state, event.document);
	});
	state.documents.onDidChangeContent((event) => {
		publishDiagnostics(state, event.document);
	});
	state.documents.onDidClose((event) => {
		state.analyses.delete(event.document.uri);
		state.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
	});
}

function wireRequests(state: ServerState): void {
	state.connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
		state.supportsMarkupDiagnostics = params.capabilities.textDocument?.diagnostic?.markupMessageSupport ?? false;
		return serverCapabilities(await state.getAnalyzer());
	});

	state.connection.onInitialized(() => {
		state.connection.console.log("recipe-lsp ready");
	});

	state.connection.onDocumentSymbol(async (params) => {
		const document = state.documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return (await getAnalysis(state, document)).symbols;
	});

	state.connection.onHover(async (params) => {
		const document = state.documents.get(params.textDocument.uri);
		if (!document) {
			return null;
		}
		const analyzer = await state.getAnalyzer();
		return analyzer.hoverForPosition(await getAnalysis(state, document), params.position);
	});

	state.connection.onCompletion(async (params) => {
		const analyzer = await state.getAnalyzer();
		const document = state.documents.get(params.textDocument.uri);
		if (!document) {
			return analyzer.completionItems();
		}
		return analyzer.completionsAt(await getAnalysis(state, document), params.position);
	});

	state.connection.onFoldingRanges(async (params) => {
		const document = state.documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		return (await getAnalysis(state, document)).foldingRanges;
	});

	state.connection.onSelectionRanges(async (params) => {
		const document = state.documents.get(params.textDocument.uri);
		if (!document) {
			return [];
		}
		const analyzer = await state.getAnalyzer();
		return analyzer.selectionRanges(await getAnalysis(state, document), params.positions);
	});

	state.connection.languages.semanticTokens.on(async (params) => {
		const document = state.documents.get(params.textDocument.uri);
		if (!document) {
			return emptySemanticTokens();
		}
		return buildSemanticTokens((await getAnalysis(state, document)).semanticTokens);
	});
}

export function startRecipeServer(
	connection: Connection,
	getAnalyzer: () => Promise<RecipeAnalyzer>,
): void {
	const state: ServerState = {
		connection,
		documents: new TextDocuments(TextDocument),
		analyses: new Map(),
		getAnalyzer,
		supportsMarkupDiagnostics: false,
	};

	wireDocumentEvents(state);
	wireRequests(state);

	state.documents.listen(state.connection);
	state.connection.listen();
}
