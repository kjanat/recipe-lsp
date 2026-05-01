#!/usr/bin/env node
import process from "node:process";

import { createConnection, ProposedFeatures } from "vscode-languageserver/node.js";

import { getNodeRecipeAnalyzer } from "./src/runtime/node-analyzer.ts";
import { startRecipeServer } from "./src/server/lsp-server.ts";
import { evaluateNodeCliArgs, writeNodeCliMessage } from "./src/server/node-cli.ts";

const cliArgs = process.argv.slice(2);
const cliResult = evaluateNodeCliArgs(cliArgs);

if (cliResult.kind === "exit") {
	writeNodeCliMessage(cliResult);
	process.exit(cliResult.code);
}

const connection = createConnection(ProposedFeatures.all);

startRecipeServer(connection, getNodeRecipeAnalyzer);
