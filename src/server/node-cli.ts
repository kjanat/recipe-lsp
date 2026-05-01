type CliExit = {
	kind: "exit";
	code: 0 | 1;
	message: string;
	stream: "stdout" | "stderr";
};

type CliStart = {
	kind: "start";
};

export type NodeCliResult = CliExit | CliStart;

const HELP_FLAGS = new Set(["--help", "-h"]);

function usageText(): string {
	return [
		"recipe-lsp",
		"Recipe language server.",
		"",
		"Usage:",
		"  recipe-lsp --stdio",
		"  recipe-lsp --node-ipc",
		"  recipe-lsp --socket=PORT",
		"",
		"Options:",
		"  --stdio        Speak LSP over stdin/stdout.",
		"  --node-ipc     Speak LSP over Node IPC.",
		"  --socket=PORT  Speak LSP over a TCP socket.",
		"  -h, --help     Show this help.",
		"",
		"Tip:",
		"  This server needs one transport flag. Running it bare will fail.",
	].join("\n");
}

function errorText(message: string): string {
	return `${usageText()}\n\nError: ${message}`;
}

function isSocketArg(arg: string): boolean {
	return arg.startsWith("--socket=");
}

function isValidPort(value: string): boolean {
	if (!/^\d+$/.test(value)) {
		return false;
	}
	const port = Number(value);
	return Number.isSafeInteger(port) && port > 0 && port <= 65_535;
}

export function evaluateNodeCliArgs(args: readonly string[]): NodeCliResult {
	for (const arg of args) {
		if (HELP_FLAGS.has(arg)) {
			return {
				kind: "exit",
				code: 0,
				message: usageText(),
				stream: "stdout",
			};
		}
	}

	const unknownArgs: string[] = [];
	let transportCount = 0;

	for (const arg of args) {
		if (arg === "--stdio" || arg === "--node-ipc") {
			transportCount += 1;
			continue;
		}
		if (isSocketArg(arg)) {
			transportCount += 1;
			const value = arg.slice("--socket=".length);
			if (!isValidPort(value)) {
				return {
					kind: "exit",
					code: 1,
					message: errorText(`Bad socket port: ${value || "<empty>"}. Use 1-65535.`),
					stream: "stderr",
				};
			}
			continue;
		}
		unknownArgs.push(arg);
	}

	if (unknownArgs.length > 0) {
		const rendered = unknownArgs.map((arg) => `\`${arg}\``).join(", ");
		return {
			kind: "exit",
			code: 1,
			message: errorText(`Unknown argument${unknownArgs.length === 1 ? "" : "s"}: ${rendered}.`),
			stream: "stderr",
		};
	}

	if (transportCount === 0) {
		return {
			kind: "exit",
			code: 1,
			message: errorText("Missing transport flag."),
			stream: "stderr",
		};
	}

	if (transportCount > 1) {
		return {
			kind: "exit",
			code: 1,
			message: errorText("Choose exactly one transport flag."),
			stream: "stderr",
		};
	}

	return { kind: "start" };
}

export function writeNodeCliMessage(result: CliExit): void {
	const output = `${result.message}\n`;
	if (result.stream === "stdout") {
		process.stdout.write(output);
		return;
	}
	process.stderr.write(output);
}
