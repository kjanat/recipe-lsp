/**
 * @module
 * Universal entrypoint for `recipe-lsp`.
 *
 * Importing this module gives you the recipe analyzer without caring which
 * runtime you are on: {@link getRecipeAnalyzer} detects browser/worker vs
 * Node/Deno at call time and lazily loads the matching runtime — the
 * `fetch`-backed browser analyzer or the `node:fs` + `import.meta.resolve`
 * analyzer — so the heavy runtime is only pulled in when actually used.
 *
 * ```ts
 * import { getRecipeAnalyzer } from "@kjanat/recipe-lsp";
 * const analyzer = await getRecipeAnalyzer();
 * const analysis = analyzer.analyzeRecipe("R/ amoxicilline 500 mg\nS/ 3 dd 1 tablet");
 * ```
 *
 * To run a language server, wire an analyzer to a connection with
 * {@link startRecipeServer}; to drive the parser yourself, use
 * {@link createRecipeAnalyzer}.
 */
import type { RecipeAnalyzer } from "#anal/recipe-analyzer.ts";

/** True in a browser document or Web Worker; false on Node/Deno. */
function isBrowserRuntime(): boolean {
	return "document" in globalThis || "WorkerGlobalScope" in globalThis;
}

/**
 * Resolve a {@link RecipeAnalyzer} for the current runtime, loading the
 * browser or Node/Deno runtime on demand.
 */
export async function getRecipeAnalyzer(): Promise<RecipeAnalyzer> {
	if (isBrowserRuntime()) {
		const browser = await import("#runtime/browser-analyzer.ts");
		return await browser.getBrowserRecipeAnalyzer();
	}
	const node = await import("#runtime/node-analyzer.ts");
	return await node.getNodeRecipeAnalyzer();
}

export { createRecipeAnalyzer } from "#anal/recipe-analyzer.ts";
export type { RecipeAnalysis, RecipeAnalyzer } from "#anal/recipe-analyzer.ts";
export { startRecipeServer } from "#server/lsp-server.ts";
