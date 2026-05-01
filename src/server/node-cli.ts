import process from "node:process";

interface CliExit {
	kind: "exit";
	code: 0 | 1;
	message: string;
	stream: "stdout" | "stderr";
}

interface CliStart {
	kind: "start";
}

const HELP_FLAGS = new Set(["--help", "-h"]);
const PORT_PATTERN = /^\d+$/u;
const SOCKET_PREFIX = "--socket=";
const MAX_PORT = 65_535;

interface ParsedArgs {
	transportCount: number;
	unknownArgs: string[];
	badPort: string | null;
}

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

function exitWith(message: string, code: 0 | 1, stream: "stdout" | "stderr"): CliExit {
	return { kind: "exit", code, message, stream };
}

function isSocketArg(arg: string): boolean {
	return arg.startsWith(SOCKET_PREFIX);
}

function isValidPort(value: string): boolean {
	if (!PORT_PATTERN.test(value)) {
		return false;
	}
	const port = Number(value);
	return Number.isSafeInteger(port) && port > 0 && port <= MAX_PORT;
}

function parseArgs(args: readonly string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		transportCount: 0,
		unknownArgs: [],
		badPort: null,
	};

	for (const arg of args) {
		if (arg === "--stdio" || arg === "--node-ipc") {
			parsed.transportCount += 1;
		} else if (isSocketArg(arg)) {
			parsed.transportCount += 1;
			const value = arg.slice(SOCKET_PREFIX.length);
			if (!isValidPort(value)) {
				parsed.badPort = value || "<empty>";
			}
		} else {
			parsed.unknownArgs.push(arg);
		}
	}

	return parsed;
}

function unknownArgumentMessage(unknownArgs: readonly string[]): string {
	const rendered = unknownArgs.map((arg) => `\`${arg}\``).join(", ");
	if (unknownArgs.length === 1) {
		return `Unknown argument: ${rendered}.`;
	}
	return `Unknown arguments: ${rendered}.`;
}

function evaluateNodeCliArgs(args: readonly string[]): NodeCliResult {
	if (args.some((arg) => HELP_FLAGS.has(arg))) {
		return exitWith(usageText(), 0, "stdout");
	}

	const parsed = parseArgs(args);
	if (parsed.badPort !== null) {
		return exitWith(errorText(`Bad socket port: ${parsed.badPort}. Use 1-65535.`), 1, "stderr");
	}

	if (parsed.unknownArgs.length > 0) {
		return exitWith(errorText(unknownArgumentMessage(parsed.unknownArgs)), 1, "stderr");
	}

	if (parsed.transportCount === 0) {
		return exitWith(errorText("Missing transport flag."), 1, "stderr");
	}

	if (parsed.transportCount > 1) {
		return exitWith(errorText("Choose exactly one transport flag."), 1, "stderr");
	}

	return { kind: "start" };
}

function writeNodeCliMessage(result: CliExit): void {
	const output = `${result.message}\n`;
	if (result.stream === "stdout") {
		process.stdout.write(output);
		return;
	}
	process.stderr.write(output);
}

type NodeCliResult = CliExit | CliStart;

export { evaluateNodeCliArgs, writeNodeCliMessage };
export type { NodeCliResult };
