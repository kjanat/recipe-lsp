// A tiny LSP client that talks to the recipe-lsp Web Worker over its message
// channel (raw JSON-RPC objects, no Content-Length framing — that is what
// vscode-languageserver's BrowserMessageReader/Writer expect).

const DOC_URI = "file:///demo.recipe";
const SAMPLE = `R/ amoxicilline 500 mg
Da/ 30 tabletten
S/ 3 dd 1 tablet gedurende 10 dagen`;

const els = {
	status: document.querySelector("#status"),
	caps: document.querySelector("#caps"),
	editor: document.querySelector("#editor"),
	diagnostics: document.querySelector("#diagnostics"),
	symbols: document.querySelector("#symbols"),
};

const SEVERITY = { 1: ["error", "Error"], 2: ["warn", "Warning"], 3: ["info", "Information"], 4: ["hint", "Hint"] };

function setStatus(state, text) {
	els.status.dataset.state = state;
	els.status.textContent = text;
}

setStatus("loading", "Booting worker from jsDelivr…");

const worker = new Worker("./recipe-worker.js", { type: "module" });
worker.addEventListener("error", (event) => {
	setStatus("error", `Worker failed: ${event.message || "unknown error"}`);
});

let nextId = 1;
const pending = new Map();

function request(method, params) {
	const id = nextId++;
	worker.postMessage({ jsonrpc: "2.0", id, method, params });
	return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params) {
	worker.postMessage({ jsonrpc: "2.0", method, params });
}

worker.addEventListener("message", (event) => {
	const message = event.data;
	if (message.id !== undefined && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		message.error ? reject(message.error) : resolve(message.result);
		return;
	}
	if (message.method === "textDocument/publishDiagnostics") {
		renderDiagnostics(message.params.diagnostics);
	}
});

function renderCapabilities(capabilities) {
	const labels = {
		documentSymbolProvider: "symbols",
		hoverProvider: "hover",
		completionProvider: "completions",
		foldingRangeProvider: "folding",
		selectionRangeProvider: "selection",
		semanticTokensProvider: "semantic tokens",
		textDocumentSync: "sync",
	};
	els.caps.replaceChildren(
		...Object.entries(labels)
			.filter(([key]) => capabilities[key])
			.map(([, label]) => {
				const chip = document.createElement("span");
				chip.className = "chip";
				chip.textContent = label;
				return chip;
			}),
	);
}

function renderDiagnostics(diagnostics) {
	els.diagnostics.replaceChildren();
	if (diagnostics.length === 0) {
		const ok = document.createElement("p");
		ok.className = "empty";
		ok.textContent = "No problems found.";
		els.diagnostics.append(ok);
		return;
	}
	for (const diagnostic of diagnostics) {
		const [cls, name] = SEVERITY[diagnostic.severity] ?? SEVERITY[1];
		const { line, character } = diagnostic.range.start;
		const item = document.createElement("li");
		item.className = `diag ${cls}`;
		const where = document.createElement("span");
		where.className = "where";
		where.textContent = `${name} · ${line + 1}:${character + 1}`;
		const msg = document.createElement("span");
		msg.className = "msg";
		msg.textContent = typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value;
		item.append(where, msg);
		els.diagnostics.append(item);
	}
}

function renderSymbols(symbols) {
	els.symbols.replaceChildren();
	if (!symbols || symbols.length === 0) {
		const empty = document.createElement("p");
		empty.className = "empty";
		empty.textContent = "No sections.";
		els.symbols.append(empty);
		return;
	}
	for (const symbol of symbols) {
		const item = document.createElement("li");
		item.className = "symbol";
		item.textContent = symbol.name;
		els.symbols.append(item);
	}
}

let version = 0;

async function refreshSymbols() {
	try {
		const symbols = await request("textDocument/documentSymbol", { textDocument: { uri: DOC_URI } });
		renderSymbols(symbols);
	} catch {
		renderSymbols([]);
	}
}

function syncDocument(text) {
	version += 1;
	notify("textDocument/didChange", {
		textDocument: { uri: DOC_URI, version },
		contentChanges: [{ text }],
	});
	void refreshSymbols();
}

async function main() {
	const { capabilities } = await request("initialize", {
		processId: null,
		rootUri: null,
		capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true } } },
	});
	notify("initialized", {});
	renderCapabilities(capabilities);
	setStatus("ready", "LSP ready — running entirely in your browser");

	els.editor.value = SAMPLE;
	els.editor.disabled = false;
	notify("textDocument/didOpen", {
		textDocument: { uri: DOC_URI, languageId: "recipe", version: ++version, text: SAMPLE },
	});
	void refreshSymbols();

	let debounce;
	els.editor.addEventListener("input", () => {
		clearTimeout(debounce);
		debounce = setTimeout(() => syncDocument(els.editor.value), 150);
	});
}

main().catch((error) => setStatus("error", `Init failed: ${error?.message ?? error}`));
