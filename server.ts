#!/usr/bin/env node
/**
 * @module server
 * Node entrypoint for the recipe language server (`recipe-lsp`).
 *
 * Assembles and runs the {@link "@kjanat/dreamcli"} CLI: it parses the
 * transport, builds the matching {@link createLspConnection | connection}, and
 * serves. The single command also prints shell completions on `--completions`.
 * This module has side effects on import — it is the executable `bin`, not a
 * library; import {@link "./mod.ts"} for the analyzer API instead.
 */
import { arg, cli, command, flag, generateCompletion, SHELLS } from "@kjanat/dreamcli";

import { getNodeRecipeAnalyzer } from "#runtime/node-analyzer.ts";
import { startRecipeServer } from "#server/lsp-server.ts";
import { createLspConnection, resolveTransport } from "#server/node-cli.ts";

/* dprint-ignore */
const recipeLspCommand = command("recipe-lsp")
	.description("Recipe pharmacological-notation language server — speaks LSP over stdio, Node IPC, or a TCP socket.")
	.arg("transport", arg.enum(["stdio", "node-ipc", "socket"]).optional().describe("Transport to speak (default: stdio)"))
	.flag("port", flag.number().describe("TCP port for the socket transport"))
	.flag("stdio", flag.boolean().describe("LSP-conventional alias for `stdio`"))
	.flag("node-ipc", flag.boolean().describe("LSP-conventional alias for `node-ipc`"))
	.flag("socket", flag.number().describe("LSP-conventional alias for `socket --port <port>`"))
	.flag("completions", flag.enum(SHELLS).describe("Print a shell completion script and exit"))
	.action(({ args, flags, out }) => {
		if (flags.completions !== undefined) {
			out.log(generateCompletion(recipeLsp.schema, flags.completions));
			return;
		}
		const transport = resolveTransport({
			arg: args.transport,
			port: flags.port,
			stdio: flags.stdio,
			nodeIpc: flags["node-ipc"],
			socket: flags.socket,
		});
		startRecipeServer(createLspConnection(transport), getNodeRecipeAnalyzer);
		return new Promise<never>(() => {});
	});

const recipeLsp = cli("recipe-lsp")
	.manifest({ from: import.meta.url, files: ["package.json", "jsr.json"] })
	.links()
	.default(recipeLspCommand);

void recipeLsp.run();
