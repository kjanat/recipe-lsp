import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { RangeSetBuilder } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	highlightActiveLine,
	hoverTooltip,
	keymap,
	lineNumbers,
	ViewPlugin,
} from "@codemirror/view";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

const DOC_URI = "file:///demo.recipe";
const THEME = "github-dark";
const SAMPLE = `\
# Oral antibiotic course
R/ amoxicilline 500 mg
Da/ 30 tabletten
S/ 3 dd 1 tablet gedurende 10 dagen`;

const els = {
	status: document.querySelector("#status"),
	caps: document.querySelector("#caps"),
	editor: document.querySelector("#editor"),
	diagnostics: document.querySelector("#diagnostics"),
	symbols: document.querySelector("#symbols"),
};
function setStatus(state, text) {
	els.status.dataset.state = state;
	els.status.textContent = text;
}
setStatus("loading", "Booting language server + Shiki…");

// ── LSP client over the worker message channel ─────────────────────────────
const worker = new Worker("./recipe-worker.js", { type: "module" });
worker.addEventListener("error", (e) => setStatus("error", `Worker failed: ${e.message || "unknown"}`));

let nextId = 1;
const pending = new Map();
let onDiagnostics = () => {};

function request(method, params) {
	const id = nextId++;
	worker.postMessage({ jsonrpc: "2.0", id, method, params });
	return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
function notify(method, params) {
	worker.postMessage({ jsonrpc: "2.0", method, params });
}
worker.addEventListener("message", (event) => {
	const m = event.data;
	if (m.id !== undefined && pending.has(m.id)) {
		const { resolve, reject } = pending.get(m.id);
		pending.delete(m.id);
		if (m.error) reject(m.error);
		else resolve(m.result);
		return;
	}
	if (m.method === "textDocument/publishDiagnostics") onDiagnostics(m.params.diagnostics);
});

// ── position helpers (CodeMirror offset ↔ LSP line/character) ───────────────
const toLsp = (doc, offset) => {
	const line = doc.lineAt(offset);
	return { line: line.number - 1, character: offset - line.from };
};
const fromLsp = (doc, pos) => {
	const line = doc.line(Math.min(pos.line + 1, doc.lines));
	return Math.min(line.from + pos.character, line.to);
};

// ── Shiki highlighting as CodeMirror decorations ───────────────────────────
// Shiki tokenises with the real recipe TextMate grammar (recipe-shiki) and gives
// themed tokens with absolute offsets; we paint each as an inline-coloured mark.
function shikiHighlighter(shiki) {
	const decorate = (view) => {
		const code = view.state.doc.toString();
		const lines = shiki.codeToTokensBase(code, { lang: "recipe", theme: THEME });
		const builder = new RangeSetBuilder();
		for (const tokens of lines) {
			for (const token of tokens) {
				const from = token.offset;
				const to = from + token.content.length;
				if (to > from && token.color) {
					builder.add(from, to, Decoration.mark({ attributes: { style: `color:${token.color}` } }));
				}
			}
		}
		return builder.finish();
	};
	return ViewPlugin.fromClass(
		class {
			constructor(view) {
				this.decorations = decorate(view);
			}
			update(update) {
				if (update.docChanged || update.viewportChanged) this.decorations = decorate(update.view);
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

// The recipe TextMate grammar (the same one `recipe-shiki` ships) — fetched as
// raw JSON and wrapped into a Shiki LanguageRegistration, exactly as recipe-shiki
// does. We fetch it directly because recipe-shiki's esm.sh build imports the
// `.json` without a type assertion, which browsers reject.
const RECIPE_GRAMMAR_URL = "https://cdn.jsdelivr.net/npm/recipe-tmlanguage@0.3.5/recipe.tmLanguage.json";

async function createShiki() {
	const grammar = await fetch(RECIPE_GRAMMAR_URL).then((response) => response.json());
	const recipe = { ...grammar, name: "recipe", scopeName: "source.recipe", displayName: "Recipe" };
	return createHighlighterCore({
		themes: [import("@shikijs/themes/github-dark")],
		langs: [recipe],
		engine: createOnigurumaEngine(import("shiki/wasm")),
	});
}

// ── side panels ────────────────────────────────────────────────────────────
const SEVERITY = { 1: "error", 2: "warning", 3: "info", 4: "info" };
const messageText = (message) => (typeof message === "string" ? message : message.value);

function renderCapabilities(capabilities) {
	const labels = {
		semanticTokensProvider: "semantic tokens",
		hoverProvider: "hover",
		completionProvider: "completions",
		documentSymbolProvider: "symbols",
		foldingRangeProvider: "folding",
		selectionRangeProvider: "selection",
	};
	els.caps.replaceChildren(
		...Object.entries(labels).filter(([k]) => capabilities[k]).map(([, label]) => {
			const chip = document.createElement("span");
			chip.className = "chip";
			chip.textContent = label;
			return chip;
		}),
	);
}
function renderDiagnosticsList(diagnostics) {
	els.diagnostics.replaceChildren();
	if (diagnostics.length === 0) {
		const ok = document.createElement("p");
		ok.className = "empty";
		ok.textContent = "No problems found.";
		els.diagnostics.append(ok);
		return;
	}
	for (const d of diagnostics) {
		const item = document.createElement("li");
		item.className = `diag ${SEVERITY[d.severity] ?? "error"}`;
		const where = document.createElement("span");
		where.className = "where";
		where.textContent = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
		const msg = document.createElement("span");
		msg.className = "msg";
		msg.textContent = messageText(d.message);
		item.append(where, msg);
		els.diagnostics.append(item);
	}
}
async function refreshSymbols() {
	try {
		const symbols = await request("textDocument/documentSymbol", { textDocument: { uri: DOC_URI } });
		els.symbols.replaceChildren();
		if (!symbols || symbols.length === 0) {
			const empty = document.createElement("p");
			empty.className = "empty";
			empty.textContent = "No sections.";
			els.symbols.append(empty);
			return;
		}
		for (const s of symbols) {
			const item = document.createElement("li");
			item.className = "symbol";
			item.textContent = s.name;
			els.symbols.append(item);
		}
	} catch {
		/* ignore */
	}
}

// ── LSP-wired editor extensions ────────────────────────────────────────────
const recipeHover = hoverTooltip(async (view, pos) => {
	const result = await request("textDocument/hover", {
		textDocument: { uri: DOC_URI },
		position: toLsp(view.state.doc, pos),
	}).catch(() => null);
	const raw = result?.contents == null ? "" : messageText(result.contents);
	if (!raw) return null;
	// Render the LSP markdown lightly: strip bold/code markers, keep line breaks.
	const text = raw.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").trim();
	return {
		pos,
		create() {
			const dom = document.createElement("div");
			dom.className = "cm-hover";
			dom.textContent = text;
			return { dom };
		},
	};
});

const recipeComplete = autocompletion({
	override: [
		async (ctx) => {
			const result = await request("textDocument/completion", {
				textDocument: { uri: DOC_URI },
				position: toLsp(ctx.state.doc, ctx.pos),
			}).catch(() => null);
			const items = Array.isArray(result) ? result : (result?.items ?? []);
			if (items.length === 0) return null;
			const word = ctx.matchBefore(/\S*/);
			return {
				from: word ? word.from : ctx.pos,
				options: items.map((it) => ({
					label: it.label,
					detail: it.detail,
					info: it.documentation == null ? undefined : messageText(it.documentation),
					apply: it.textEdit?.newText ?? it.insertText ?? it.label,
				})),
			};
		},
	],
});

const darkTheme = EditorView.theme(
	{
		"&": { color: "#dbd7ca", backgroundColor: "#0f1115", fontSize: "0.95rem" },
		".cm-content": { fontFamily: "var(--mono)", caretColor: "#f7df1e" },
		".cm-gutters": { backgroundColor: "#0f1115", color: "#5a6373", border: "none" },
		".cm-activeLine": { backgroundColor: "#ffffff08" },
		".cm-activeLineGutter": { backgroundColor: "#ffffff0a" },
		".cm-tooltip": { background: "#1f232c", border: "1px solid #2a2f3a", borderRadius: "6px" },
		".cm-hover": {
			padding: "0.4rem 0.6rem",
			maxWidth: "42ch",
			fontSize: "0.85rem",
			lineHeight: "1.45",
			whiteSpace: "pre-wrap",
		},
	},
	{ dark: true },
);

let view;
let version = 0;
let debounce;

function pushDocChange(text) {
	version += 1;
	notify("textDocument/didChange", { textDocument: { uri: DOC_URI, version }, contentChanges: [{ text }] });
	void refreshSymbols();
}

async function main() {
	const [{ capabilities }, shiki] = await Promise.all([
		request("initialize", {
			processId: null,
			rootUri: null,
			capabilities: { textDocument: { publishDiagnostics: {}, hover: { contentFormat: ["plaintext"] } } },
		}),
		createShiki(),
	]);
	notify("initialized", {});
	renderCapabilities(capabilities);

	view = new EditorView({
		parent: els.editor,
		state: EditorState.create({
			doc: SAMPLE,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				history(),
				keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
				shikiHighlighter(shiki),
				lintGutter(),
				recipeHover,
				recipeComplete,
				darkTheme,
				EditorView.lineWrapping,
				EditorView.updateListener.of((update) => {
					if (!update.docChanged) return;
					clearTimeout(debounce);
					debounce = setTimeout(() => pushDocChange(update.state.doc.toString()), 150);
				}),
			],
		}),
	});

	onDiagnostics = (diagnostics) => {
		renderDiagnosticsList(diagnostics);
		const doc = view.state.doc;
		const marks = diagnostics
			.map((d) => ({
				from: fromLsp(doc, d.range.start),
				to: fromLsp(doc, d.range.end),
				severity: SEVERITY[d.severity] ?? "error",
				message: messageText(d.message),
				source: d.source,
			}))
			.filter((m) => m.to > m.from || m.from < doc.length);
		view.dispatch(setDiagnostics(view.state, marks));
	};

	version += 1;
	notify("textDocument/didOpen", { textDocument: { uri: DOC_URI, languageId: "recipe", version, text: SAMPLE } });
	void refreshSymbols();
	setStatus("ready", "LSP + Shiki ready — highlighting, diagnostics, hover & completion, all in your browser");
}

main().catch((error) => setStatus("error", `Init failed: ${error?.message ?? error}`));
