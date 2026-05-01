/// <reference lib="WebWorker" />
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from "vscode-languageserver/browser.js";

import { getBrowserRecipeAnalyzer } from "./src/runtime/browser-analyzer.ts";
import { startRecipeServer } from "./src/server/lsp-server.ts";

declare const self: DedicatedWorkerGlobalScope;

const connection = createConnection(
	new BrowserMessageReader(self),
	new BrowserMessageWriter(self),
);

startRecipeServer(connection, getBrowserRecipeAnalyzer);
