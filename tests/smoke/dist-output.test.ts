import { beforeAll, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const distDir = join(repoRoot, "dist");
const builtServerPath = join(distDir, "server.mjs");
const builtBrowserPath = join(distDir, "browser.js");
const execFileAsync = promisify(execFile);
const ONE_MEBIBYTE: number = 1024 * 1024;
const MAX_COMMAND_OUTPUT: number = 10 * ONE_MEBIBYTE;

async function runCommand(cmd: readonly string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const [command, ...args] = cmd;
	if (!command) {
		throw new Error("Missing command");
	}
	try {
		const result = await execFileAsync(command, args, { cwd: repoRoot, maxBuffer: MAX_COMMAND_OUTPUT });
		return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}

		const commandError = error as Error & {
			code?: number;
			stdout?: string;
			stderr?: string;
		};
		return {
			exitCode: commandError.code ?? 1,
			stdout: commandError.stdout ?? "",
			stderr: commandError.stderr ?? "",
		};
	}
}

beforeAll(async () => {
	const result = await runCommand(["bun", "run", "build"]);
	if (result.exitCode !== 0) {
		throw new Error(`build failed\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`);
	}
});

describe("built output smoke", () => {
	test("emits browser and wasm artifacts to dist", async () => {
		const browserBundle = await readFile(builtBrowserPath, "utf8");
		const runtimeWasm = await readFile(join(distDir, "web-tree-sitter.wasm"));
		const recipeWasm = await readFile(join(distDir, "tree-sitter-recipe.wasm"));

		expect(browserBundle).not.toContain("import recipeWasmUrl from \"tree-sitter-recipe/tree-sitter-recipe.wasm?url\"");
		expect(browserBundle).not.toContain("import runtimeWasmUrl from \"web-tree-sitter/web-tree-sitter.wasm?url\"");
		expect(runtimeWasm.byteLength).toBeGreaterThan(0);
		expect(recipeWasm.byteLength).toBeGreaterThan(0);
	});

	test("built CLI prints help", async () => {
		const result = await runCommand(["node", builtServerPath, "--help"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage:");
		expect(result.stdout).toContain("--stdio");
	});

	test("built CLI prints friendly unknown arg error", async () => {
		const result = await runCommand(["node", builtServerPath, "skraskra"]);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Unknown argument");
		expect(result.stderr).toContain("Error:");
	});
});
