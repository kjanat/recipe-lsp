#!/usr/bin/env bun

import { TextDocument } from "vscode-languageserver-textdocument";
import {
	createConnection,
	type InitializeResult,
	ProposedFeatures,
	TextDocuments,
	TextDocumentSyncKind,
} from "vscode-languageserver/node";

import { analyzeRecipe, completionItems, hoverForPosition, type RecipeAnalysis } from "./src/analysis";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analyses = new Map<
	string,
	{ version: number; analysis: RecipeAnalysis }
>();

function getAnalysis(document: TextDocument): RecipeAnalysis {
	const cached = analyses.get(document.uri);
	if (cached && cached.version === document.version) {
		return cached.analysis;
	}

	const analysis = analyzeRecipe(document.getText());
	analyses.set(document.uri, { version: document.version, analysis });
	return analysis;
}

function publishDiagnostics(document: TextDocument): void {
	const analysis = getAnalysis(document);
	connection.sendDiagnostics({
		uri: document.uri,
		diagnostics: analysis.diagnostics,
	});
}

connection.onInitialize(
	(): InitializeResult => ({
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			documentSymbolProvider: true,
			hoverProvider: true,
			completionProvider: {
				triggerCharacters: ["/", "."],
			},
		},
	}),
);

connection.onInitialized(() => {
	connection.console.log("recipe-lsp ready");
});

documents.onDidOpen((event) => {
	publishDiagnostics(event.document);
});

documents.onDidChangeContent((event) => {
	publishDiagnostics(event.document);
});

documents.onDidClose((event) => {
	analyses.delete(event.document.uri);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDocumentSymbol((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}

	return getAnalysis(document).symbols;
});

connection.onHover((params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return null;
	}

	return hoverForPosition(getAnalysis(document), params.position);
});

connection.onCompletion(() => completionItems());

documents.listen(connection);
connection.listen();
