import { fileURLToPath } from "node:url";

import type { HookFilter, Plugin } from "rolldown";

export interface ResolveBrowserWasmOptions {
	/** WASM specifiers rewritten to `?url` imports. */
	specifiers: readonly string[];
	/** Which module id(s) to transform — glob string(s) or RegExp (rolldown's `transform` id filter). */
	include: HookFilter["id"];
}

/**
 * Source resolves wasm with `import.meta.resolve(...)` (portable, JSR-safe).
 * For the bundled browser build, rewrite those runtime calls into emitted `?url`
 * assets so `dist/browser.js` stays self-contained — the bundler's job, done here.
 *
 * The target module is selected by the caller via `include` (a rolldown hook
 * filter), so the plugin carries no knowledge of any particular file layout.
 */
export function resolveBrowserWasmMetaResolve({ specifiers, include }: ResolveBrowserWasmOptions): Plugin {
	return {
		name: "rewrite-browser-wasm-meta-resolve",
		transform: {
			filter: { id: include },
			handler(code: string): { code: string; map: null } | null {
				let nextCode = code;
				const injections: string[] = [];
				specifiers.forEach((specifier, index) => {
					const call = `import.meta.resolve("${specifier}")`;
					if (!nextCode.includes(call)) {
						return;
					}
					const binding = `__wasmUrl${index}`;
					const absolute = fileURLToPath(import.meta.resolve(specifier));
					injections.push(`import ${binding} from "${absolute}?url";`);
					nextCode = nextCode.split(call).join(binding);
				});

				if (injections.length === 0) {
					return null;
				}

				return { code: `${injections.join("\n")}\n${nextCode}`, map: null };
			},
		},
	};
}
