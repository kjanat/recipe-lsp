/**
 * @module
 * Browser Web Worker entrypoint for the recipe language server.
 *
 * Wires the `fetch`-backed analyzer to a worker message channel. Load it as a
 * module worker — `new Worker(new URL("@kjanat/recipe-lsp/browser", import.meta.url), { type: "module" })`.
 * This module has side effects on import (it starts the server); import
 * {@link "./mod.ts"} for the analyzer API instead.
 */
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from "vscode-languageserver/browser.js";

import { getBrowserRecipeAnalyzer } from "./src/runtime/browser-analyzer.ts";
import { startRecipeServer } from "./src/server/lsp-server.ts";

declare const self: DedicatedWorkerGlobalScope;

const connection = createConnection(
	new BrowserMessageReader(self),
	new BrowserMessageWriter(self),
);

startRecipeServer(connection, getBrowserRecipeAnalyzer);
