import { $ } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import type { PathLike } from "node:fs";
import { access, constants, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.resolve("#pkg")));
const distDir = join(repoRoot, "dist");

const [builtServerPath, builtBrowserPath, builtBrowserAnalyzerPath] = [
	join(distDir, "server.js"),
	join(distDir, "browser.js"),
	join(distDir, "browser-analyzer.js"),
];

beforeAll(async () => {
	const build = await $`bun run build`.cwd(repoRoot).nothrow().quiet();
	if (build.exitCode !== 0) {
		throw new Error(`build failed\nstdout:\n${build.stdout.toString()}\n\nstderr:\n${build.stderr.toString()}`);
	}
});

async function fileExists(path: PathLike): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

describe("built output smoke", () => {
	test("browser build resolves wasm at runtime, emits no wasm assets", async () => {
		// The browser entry exists and pulls in the analyzer chunk.
		const browserBundle = await readFile(builtBrowserPath, "utf8");
		expect(browserBundle).toContain("./browser-analyzer.js");

		// Wasm is resolved at runtime via `import.meta.resolve` of the package
		// specifiers — not inlined as bundler-only `?url` assets.
		const analyzerChunk = await readFile(builtBrowserAnalyzerPath, "utf8");
		expect(analyzerChunk).toContain("import.meta.resolve");
		expect(analyzerChunk).toContain("tree-sitter-recipe/tree-sitter-recipe.wasm");
		expect(analyzerChunk).toContain("web-tree-sitter/web-tree-sitter.wasm");
		expect(analyzerChunk).not.toContain("?url");

		// No wasm is emitted to dist; consumers resolve it from node_modules.
		expect(await fileExists(join(distDir, "web-tree-sitter.wasm"))).toBeFalse();
		expect(await fileExists(join(distDir, "tree-sitter-recipe.wasm"))).toBeFalse();
	});

	test("built CLI prints help", async () => {
		const result = await $`node ${builtServerPath} --help`.cwd(repoRoot).nothrow().quiet();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Usage:");
		expect(result.stdout.toString()).toContain("--stdio");
	});

	test("built CLI prints friendly unknown arg error", async () => {
		const result = await $`node ${builtServerPath} skraskra`.cwd(repoRoot).nothrow().quiet();
		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Unknown argument");
		expect(result.stderr.toString()).toContain("Error:");
	});
});
