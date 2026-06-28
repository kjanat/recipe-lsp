import { fileURLToPath } from "node:url";

import { wasm } from "rolldown-plugin-wasm";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const PACKAGE_WASM_SPECIFIERS = [
	"tree-sitter-recipe/tree-sitter-recipe.wasm",
	"web-tree-sitter/web-tree-sitter.wasm",
] as const;

// Source resolves wasm with `import.meta.resolve(...)` (portable, JSR-safe).
// For the bundled browser build, rewrite those runtime calls into emitted `?url`
// assets so `dist/browser.js` stays self-contained — the bundler's job, done here.
function resolveBrowserWasmMetaResolve(): {
	name: string;
	transform: (code: string, id: string) => { code: string; map: null } | null;
} {
	return {
		name: "rewrite-browser-wasm-meta-resolve",
		transform(code: string, id: string): { code: string; map: null } | null {
			if (!id.endsWith("/src/runtime/browser-analyzer.ts")) {
				return null;
			}

			let nextCode = code;
			const injections: string[] = [];
			PACKAGE_WASM_SPECIFIERS.forEach((specifier, index) => {
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
	};
}

const shared: UserConfig = {
	format: "es",
	dts: false,
	treeshake: true,
	target: "esnext",
	hash: false,
	sourcemap: false,
	minify: "dce-only",
	clean: true,
} as const;

export default defineConfig([
	{
		...shared,
		entry: "./server.ts",
		platform: "node",
		plugins: [wasm({ fileName: "[name][extname]", maxFileSize: 0 })],
	},
	{
		...shared,
		entry: "./browser.ts",
		platform: "browser",
		minify: true,
		plugins: [resolveBrowserWasmMetaResolve(), wasm({ fileName: "[name][extname]", maxFileSize: 0 })],
	},
]) satisfies UserConfig[];
