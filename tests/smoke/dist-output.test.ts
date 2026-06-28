import { $ } from "bun";
import { beforeAll, describe, expect, test } from "bun:test";
import type { PathLike } from "node:fs";
import { access, constants, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.resolve("#pkg")));
const distDir = join(repoRoot, "dist");

const [builtServerPath, builtBrowserPath] = [
	join(distDir, "server.js"),
	join(distDir, "browser.js"),
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
		// The browser entry pulls in an analyzer chunk (exact chunk name is rolldown's call).
		const browserBundle = await readFile(builtBrowserPath, "utf8");
		expect(browserBundle).toMatch(/browser-analyzer\w*\.js/u);

		// Some emitted chunk resolves the wasm at runtime via `import.meta.resolve`
		// of the package specifiers — not inlined as bundler-only `?url` assets.
		const jsChunks = (await readdir(distDir)).filter((file) => file.endsWith(".js"));
		const chunks = await Promise.all(jsChunks.map((file) => readFile(join(distDir, file), "utf8")));
		const analyzerChunk = chunks.find(
			(chunk) => chunk.includes("import.meta.resolve") && chunk.includes("tree-sitter-recipe/tree-sitter-recipe.wasm"),
		);
		if (analyzerChunk === undefined) {
			throw new Error("expected a chunk that resolves the recipe wasm at runtime");
		}
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

	test("built CLI prints a friendly unknown-flag error", async () => {
		// dreamcli renders a parse error (exit 2) instead of a raw stack trace.
		const result = await $`node ${builtServerPath} --skraskra`.cwd(repoRoot).nothrow().quiet();
		expect(result.exitCode).toBe(2);
		expect(result.stderr.toString()).toContain("Unknown flag");
	});
});
