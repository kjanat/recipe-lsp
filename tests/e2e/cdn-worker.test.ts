import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { Browser } from "playwright";

import { driveRecipeWorker, serveOriginRoot, tryLaunchChromium } from "#testsupport/worker-harness.ts";

/**
 * Opt-in: this drives a worker from the *live* CDN against the *published* package,
 * so it depends on the network and lags repo HEAD. Run it after publishing to verify
 * the real `new Worker(cdnUrl)` story:
 *
 * ```bash
 * CDN_E2E=1 bun test tests/e2e/cdn-worker.test.ts
 * CDN_E2E=1 CDN_E2E_URL="https://cdn.jsdelivr.net/npm/recipe-lsp@0.2.2/dist/browser.js" bun test
 * ```
 */
const RUN = process.env.CDN_E2E === "1";
const CDN_URL = process.env.CDN_E2E_URL ?? "https://cdn.jsdelivr.net/npm/recipe-lsp@latest/dist/browser.js";

let browser: Browser | null = null;

beforeAll(async () => {
	if (RUN) {
		browser = await tryLaunchChromium();
	}
});

afterAll(async () => {
	await browser?.close();
});

describe.skipIf(!RUN)("browser worker — live CDN", () => {
	test(`runs from ${CDN_URL}`, async () => {
		if (browser === null) {
			console.warn("[skip] no Chromium — run `bunx playwright install chromium`");
			return;
		}
		// Blank page at the CDN origin so the worker is same-origin; the worker script
		// and its sibling wasm are fetched from the real CDN.
		const origin = new URL(CDN_URL).origin;
		const page = await browser.newPage();
		await serveOriginRoot(page, origin);
		await page.goto(`${origin}/`);
		const probe = await driveRecipeWorker(page, CDN_URL);
		await page.close();

		expect(probe.errors).toEqual([]);
		expect(probe.gotInitialize).toBeTrue();
		expect(probe.diagnostics.flatMap((d) => d.messages)).toContain("S/ must follow an R/ section.");
	}, 60_000);
});
