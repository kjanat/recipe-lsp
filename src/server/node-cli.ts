import { CLIError } from "@kjanat/dreamcli";
import process, { stdin, stdout } from "node:process";

import {
	createConnection,
	createServerSocketTransport,
	IPCMessageReader,
	IPCMessageWriter,
	ProposedFeatures,
} from "vscode-languageserver/node";
import type { Connection } from "vscode-languageserver/node";

const MIN_PORT = 1;
const MAX_PORT = 65_535;

/** The transport a recipe-lsp server speaks. */
export type Transport = "stdio" | "node-ipc" | "socket";

/** A validated transport choice; `socket` always carries a resolved port. */
export type ResolvedTransport =
	| { readonly kind: "stdio" }
	| { readonly kind: "node-ipc" }
	| { readonly kind: "socket"; readonly port: number };

/** Raw transport signals from the CLI: the positional arg plus the LSP-conventional flag aliases. */
export interface TransportInput {
	readonly arg: Transport | undefined;
	readonly port: number | undefined;
	readonly stdio: boolean;
	readonly nodeIpc: boolean;
	readonly socket: number | undefined;
}

/**
 * Normalise the positional transport and the LSP-conventional flag aliases
 * (`--stdio`, `--node-ipc`, `--socket=PORT`) into a single {@link ResolvedTransport},
 * defaulting to `stdio`. Throws a `CLIError` (rendered by dreamcli) when more than
 * one transport is named, or a socket is chosen without a valid port.
 */
export function resolveTransport(input: TransportInput): ResolvedTransport {
	const choices: { kind: Transport; port: number | undefined }[] = [];
	if (input.arg !== undefined) {
		choices.push({ kind: input.arg, port: input.arg === "socket" ? input.port : undefined });
	}
	if (input.stdio) {
		choices.push({ kind: "stdio", port: undefined });
	}
	if (input.nodeIpc) {
		choices.push({ kind: "node-ipc", port: undefined });
	}
	if (input.socket !== undefined) {
		choices.push({ kind: "socket", port: input.socket });
	}

	if (choices.length > 1) {
		throw new CLIError("Choose one transport — a positional (stdio/node-ipc/socket) or a flag alias, not several.", {
			code: "AMBIGUOUS_TRANSPORT",
		});
	}

	const chosen = choices[0] ?? { kind: "stdio", port: undefined };

	if (chosen.kind !== "socket") {
		return { kind: chosen.kind };
	}

	if (chosen.port === undefined) {
		throw new CLIError("The socket transport needs a port: `recipe-lsp socket --port <port>` or `--socket=<port>`.", {
			code: "MISSING_SOCKET_PORT",
		});
	}
	if (!Number.isInteger(chosen.port) || chosen.port < MIN_PORT || chosen.port > MAX_PORT) {
		throw new CLIError(`Bad socket port: ${chosen.port}. Use ${MIN_PORT}-${MAX_PORT}.`, { code: "BAD_SOCKET_PORT" });
	}
	return { kind: "socket", port: chosen.port };
}

/** Build an LSP {@link Connection} bound to the resolved transport. */
export function createLspConnection(transport: ResolvedTransport): Connection {
	switch (transport.kind) {
		case "stdio":
			return createConnection(ProposedFeatures.all, stdin, stdout);
		case "node-ipc":
			return createConnection(ProposedFeatures.all, new IPCMessageReader(process), new IPCMessageWriter(process));
		case "socket": {
			const [reader, writer] = createServerSocketTransport(transport.port);
			return createConnection(ProposedFeatures.all, reader, writer);
		}
	}
}
