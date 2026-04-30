/// <reference lib="WebWorker" />

import { BrowserMessageReader, BrowserMessageWriter, createConnection } from "vscode-languageserver/browser";

import { getBrowserRecipeAnalyzer } from "./src/browser-analyzer.ts";
import { startRecipeServer } from "./src/server-common.ts";

declare const self: DedicatedWorkerGlobalScope;

const connection = createConnection(
	new BrowserMessageReader(self),
	new BrowserMessageWriter(self),
);

startRecipeServer(connection, getBrowserRecipeAnalyzer);
