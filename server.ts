#!/usr/bin/env node

import { exit } from "node:process";

import { createConnection, ProposedFeatures } from "vscode-languageserver/node.js";

import { getNodeRecipeAnalyzer } from "./src/node-analyzer.ts";
import { evaluateNodeCliArgs, writeNodeCliMessage } from "./src/node-cli.ts";
import { startRecipeServer } from "./src/server-common.ts";

const cliResult = evaluateNodeCliArgs(process.argv.slice(2));

if (cliResult.kind === "exit") {
	writeNodeCliMessage(cliResult);
	exit(cliResult.code);
}

const connection = createConnection(ProposedFeatures.all);

startRecipeServer(connection, getNodeRecipeAnalyzer);
