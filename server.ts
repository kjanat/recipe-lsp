#!/usr/bin/env node
/**
 * @module server
 * Node stdio entrypoint for the recipe language server (`recipe-lsp`).
 *
 * Parses the transport flag (`--stdio` / `--node-ipc` / `--socket=PORT`), wires
 * the `node:fs`-backed analyzer to a {@link createConnection | connection}, and
 * starts serving. This module has side effects on import — it is the executable
 * `bin`, not a library; import {@link "./mod.ts"} for the analyzer API instead.
 */
import { argv, exit } from "node:process";

import { createConnection, ProposedFeatures } from "vscode-languageserver/node";

import { getNodeRecipeAnalyzer } from "#runtime/node-analyzer.ts";
import { startRecipeServer } from "#server/lsp-server.ts";
import { evaluateNodeCliArgs, writeNodeCliMessage } from "#server/node-cli.ts";

const cliArgs = argv.slice(2);
const cliResult = evaluateNodeCliArgs(cliArgs);

if (cliResult.kind === "exit") {
	writeNodeCliMessage(cliResult);
	exit(cliResult.code);
}

const connection = createConnection(ProposedFeatures.all);

startRecipeServer(connection, getNodeRecipeAnalyzer);
