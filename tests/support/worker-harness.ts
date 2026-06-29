import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { type Browser, chromium, type Page } from "playwright";

/** Origin used for the in-process file server in local worker tests. */
export const TEST_ORIGIN = "https://recipe-lsp.test";

const MIME: Record<string, string> = {
	".js": "text/javascript",
	".mjs": "text/javascript",
	".wasm": "application/wasm",
	".html": "text/html",
};

const PAGE_HTML = "<!doctype html><meta charset=utf-8><title>recipe-lsp worker test</title>";

/** Launch headless Chromium, or `null` when no browser binary is installed (test then skips). */
export async function tryLaunchChromium(): Promise<Browser | null> {
	try {
		return await chromium.launch();
	} catch {
		return null;
	}
}

/**
 * Serve `baseDir` over {@link TEST_ORIGIN} via Playwright request interception — a
 * real HTTP origin with no standing server. The root path returns a blank page so
 * a same-origin module worker can be constructed against it.
 */
export async function serveDir(page: Page, baseDir: string): Promise<void> {
	await page.route(`${TEST_ORIGIN}/**`, async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === "/") {
			await route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
			return;
		}
		try {
			const body = await readFile(join(baseDir, path));
			await route.fulfill({ status: 200, contentType: MIME[extname(path)] ?? "application/octet-stream", body });
		} catch {
			await route.fulfill({ status: 404, body: "not found" });
		}
	});
}

/**
 * Serve a blank page at `origin` only (root navigation), letting every other request
 * — the worker script and its sibling wasm — hit the live network. Lets a worker be
 * constructed same-origin against a real CDN.
 */
export async function serveOriginRoot(page: Page, origin: string): Promise<void> {
	await page.route(`${origin}/`, async (route) => {
		if (new URL(route.request().url()).pathname === "/") {
			await route.fulfill({ status: 200, contentType: "text/html", body: PAGE_HTML });
			return;
		}
		await route.continue();
	});
}

/** What a recipe worker did in response to the LSP handshake + one opened document. */
export interface WorkerProbe {
	gotInitialize: boolean;
	capabilities: string[];
	diagnostics: { uri: string; messages: string[] }[];
	errors: string[];
}

/**
 * Construct a `type: "module"` worker from `workerUrl` (must be same-origin as the
 * page), run the LSP `initialize` → `initialized` → `didOpen` handshake against one
 * recipe, and resolve once diagnostics arrive (or a timeout/worker error). The whole
 * exchange runs inside the page so the worker channel is a real `postMessage` pair.
 */
export function driveRecipeWorker(page: Page, workerUrl: string, recipe = "S/ 3 dd 1 caps p."): Promise<WorkerProbe> {
	return page.evaluate(
		async ({ workerUrl, recipe }): Promise<WorkerProbe> => {
			interface RpcMessage {
				id?: number;
				method?: string;
				result?: { capabilities?: Record<string, unknown> };
				params?: { uri: string; diagnostics: { message: string }[] };
			}

			const messages: RpcMessage[] = [];
			const errors: string[] = [];
			const worker = new Worker(workerUrl, { type: "module" });
			worker.addEventListener("message", (ev: MessageEvent<RpcMessage>) => messages.push(ev.data));
			worker.addEventListener("error", (ev: ErrorEvent) => errors.push(ev.message || "(opaque worker error)"));
			const send = (message: unknown): void => worker.postMessage(message);

			const waitFor = (predicate: () => boolean, timeoutMs: number): Promise<boolean> =>
				new Promise((resolve) => {
					const startedAt = performance.now();
					const tick = (): void => {
						if (predicate()) {
							resolve(true);
							return;
						}
						if (errors.length > 0 || performance.now() - startedAt > timeoutMs) {
							resolve(false);
							return;
						}
						setTimeout(tick, 50);
					};
					tick();
				});

			send({
				jsonrpc: "2.0",
				id: 0,
				method: "initialize",
				params: { processId: null, rootUri: null, capabilities: {} },
			});
			const gotInitialize = await waitFor(() => messages.some((m) => m.id === 0 && m.result !== undefined), 25_000);
			if (gotInitialize) {
				send({ jsonrpc: "2.0", method: "initialized", params: {} });
				send({
					jsonrpc: "2.0",
					method: "textDocument/didOpen",
					params: { textDocument: { uri: "file:///t.recipe", languageId: "recipe", version: 1, text: recipe } },
				});
				await waitFor(() => messages.some((m) => m.method === "textDocument/publishDiagnostics"), 15_000);
			}
			worker.terminate();

			const init = messages.find((m) => m.id === 0 && m.result !== undefined);
			return {
				gotInitialize,
				capabilities: init?.result?.capabilities === undefined ? [] : Object.keys(init.result.capabilities),
				diagnostics: messages
					.filter((m): m is RpcMessage & { params: NonNullable<RpcMessage["params"]> } =>
						m.method === "textDocument/publishDiagnostics" && m.params !== undefined
					)
					.map((m) => ({ uri: m.params.uri, messages: m.params.diagnostics.map((d) => d.message) })),
				errors,
			};
		},
		{ workerUrl, recipe },
	);
}
