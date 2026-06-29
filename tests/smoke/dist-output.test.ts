import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PathLike } from "node:fs";
import { access, constants, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Browser } from "playwright";

import { driveRecipeWorker, serveDir, TEST_ORIGIN, tryLaunchChromium } from "#testsupport/worker-harness.ts";

const repoRoot = dirname(fileURLToPath(import.meta.resolve("#pkg")));
const distDir = join(repoRoot, "dist");

const [builtServerPath, builtBrowserPath] = [
	join(distDir, "server.js"),
	join(distDir, "browser.js"),
];

let browser: Browser | null = null;

beforeAll(async () => {
	// `dist/` is built once for the whole run by the test preload (bunfig.toml).
	browser = await tryLaunchChromium();
});

afterAll(async () => {
	await browser?.close();
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
	test("browser worker bundle is self-contained with sibling wasm assets", async () => {
		// The `./browser` worker must run from a bare-CDN `new Worker(url)` with no
		// import map and no dependency resolution. So the bundle inlines every dep
		// (no bare external imports) and references the wasm relative to its own URL.
		const browserBundle = await readFile(builtBrowserPath, "utf8");
		// Strip block comments — bundled deps carry JSDoc `@example` imports that are
		// not real statements (e.g. `* import { X } from "@kjanat/..."`).
		const code = browserBundle.replace(/\/\*[\s\S]*?\*\//gu, "");

		// No bare external `import ... from "pkg"` survives — everything is inlined.
		const bareImports = code.match(/from\s*"(?!\.\/|\.\.\/|node:)[^"]+"/gu);
		expect(bareImports).toBeNull();

		// Wasm is resolved relative to the module URL (works on any flat-serving CDN),
		// not via a bare `import.meta.resolve` specifier (which throws in a worker).
		expect(browserBundle).not.toContain("import.meta.resolve");
		expect(browserBundle).toMatch(/new URL\(\s*[`"']tree-sitter-recipe\.wasm[`"']\s*,\s*import\.meta\.url\s*\)/u);
		expect(browserBundle).toMatch(/new URL\(\s*[`"']web-tree-sitter\.wasm[`"']\s*,\s*import\.meta\.url\s*\)/u);

		// The referenced wasm assets are emitted as siblings of the bundle.
		expect(await fileExists(join(distDir, "tree-sitter-recipe.wasm"))).toBeTrue();
		expect(await fileExists(join(distDir, "web-tree-sitter.wasm"))).toBeTrue();
	});

	test("browser worker runs end-to-end as a CDN-style module worker", async () => {
		if (browser === null) {
			console.warn("[skip] no Chromium — run `bunx playwright install chromium` to exercise the worker");
			return;
		}
		// Serve dist/ at a real origin (no standing server), mirroring a flat CDN's
		// `/<pkg>/dist/browser.js` layout so the sibling-relative wasm URLs resolve.
		const page = await browser.newPage();
		await serveDir(page, repoRoot);
		await page.goto(`${TEST_ORIGIN}/`);
		const probe = await driveRecipeWorker(page, `${TEST_ORIGIN}/dist/browser.js`);
		await page.close();

		expect(probe.errors).toEqual([]);
		expect(probe.gotInitialize).toBeTrue();
		expect(probe.capabilities).toContain("completionProvider");
		// The worker compiled the grammar wasm and analysed the document.
		expect(probe.diagnostics.length).toBeGreaterThan(0);
		expect(probe.diagnostics.flatMap((d) => d.messages)).toContain("S/ must follow an R/ section.");
	}, 60_000);

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
