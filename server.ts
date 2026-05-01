#!/usr/bin/env node

import { exit } from "node:process";

import { createConnection, ProposedFeatures } from "vscode-languageserver/node.js";

import { getNodeRecipeAnalyzer } from "./src/runtime/node-analyzer.ts";
import { startRecipeServer } from "./src/server/lsp-server.ts";
import { evaluateNodeCliArgs, writeNodeCliMessage } from "./src/server/node-cli.ts";

const cliResult = evaluateNodeCliArgs(process.argv.slice(2));

if (cliResult.kind === "exit") {
	writeNodeCliMessage(cliResult);
	exit(cliResult.code);
}

const connection = createConnection(ProposedFeatures.all);

startRecipeServer(connection, getNodeRecipeAnalyzer);
