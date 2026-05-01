import { type Connection, type InitializeResult, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { RecipeAnalysis, RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

interface ServerState {
	connection: Connection;
	documents: TextDocuments<TextDocument>;
	analyses: Map<string, { version: number; analysis: RecipeAnalysis }>;
	getAnalyzer: () => Promise<RecipeAnalyzer>;
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

function publishDiagnostics(state: ServerState, document: TextDocument): void {
	(async (): Promise<void> => {
		const analysis = await getAnalysis(state, document);
		state.connection.sendDiagnostics({
			uri: document.uri,
			diagnostics: analysis.diagnostics,
		});
	})().catch((error: unknown) => {
		reportError(state.connection, `Failed to analyze ${document.uri}`, error);
	});
}

const SERVER_CAPABILITIES: InitializeResult = {
	capabilities: {
		textDocumentSync: TextDocumentSyncKind.Incremental,
		documentSymbolProvider: true,
		hoverProvider: true,
		completionProvider: {
			triggerCharacters: ["/", "."],
		},
	},
};

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
	state.connection.onInitialize(async (): Promise<InitializeResult> => {
		await state.getAnalyzer();
		return SERVER_CAPABILITIES;
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

	state.connection.onCompletion(async () => (await state.getAnalyzer()).completionItems());
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
	};

	wireDocumentEvents(state);
	wireRequests(state);

	state.documents.listen(state.connection);
	state.connection.listen();
}
