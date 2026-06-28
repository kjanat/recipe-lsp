/**
 * @module browser
 * Browser Web Worker entrypoint for the recipe language server.
 *
 * Wires the `fetch`-backed analyzer to a worker message channel.\
 * Load it as a module worker:
 * ```ts
 * new Worker("https://esm.sh/recipe-lsp/browser", { type: "module" })`
 * ```
 *
 * This module has side effects on import (it starts the server); import
 * {@link "./mod.ts"} for the analyzer API instead.
 */
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from "vscode-languageserver/browser";

import { getBrowserRecipeAnalyzer } from "#runtime/browser-analyzer.ts";
import { startRecipeServer } from "#server/lsp-server.ts";

declare const self: DedicatedWorkerGlobalScope;

const connection = createConnection(
	new BrowserMessageReader(self),
	new BrowserMessageWriter(self),
);

startRecipeServer(connection, getBrowserRecipeAnalyzer);
