import type { Plugin } from "rolldown";

const VIRTUAL_PREFIX = "\0stub:";

/**
 * Resolve a fixed set of bare specifiers to an empty module.
 *
 * `web-tree-sitter` ships one universal build that reaches for Node built-ins
 * (`fs/promises`, `module`) from branches its browser/worker runtime never takes.
 * Bundling it for the browser would otherwise leave those as unresolved bare
 * imports (a build warning, and a broken specifier if ever evaluated). Stubbing
 * them to an empty module keeps the worker bundle self-contained — no Node
 * polyfills, no dangling imports — without touching the live code paths.
 */
export function stubBareModules(specifiers: readonly string[]): Plugin {
	const stubbed = new Set(specifiers);
	return {
		name: "stub-bare-modules",
		resolveId(id) {
			return stubbed.has(id) ? `${VIRTUAL_PREFIX}${id}` : null;
		},
		load(id) {
			return id.startsWith(VIRTUAL_PREFIX) ? { code: "export default {};", moduleSideEffects: false } : null;
		},
	};
}
