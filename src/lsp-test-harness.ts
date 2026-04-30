import type { Message, NotificationMessage, RequestMessage, ResponseMessage } from "vscode-jsonrpc";
import { createConnection } from "vscode-languageserver/node";

import type { RecipeAnalyzer } from "./analysis.ts";
import { TestMessageReader } from "./lsp-test-message-reader.ts";
import type { AwaitMessageOptions } from "./lsp-test-message-writer.ts";
import { TestMessageWriter } from "./lsp-test-message-writer.ts";
import { startRecipeServer } from "./server-common.ts";

const LOG_MESSAGE_METHOD = "window/logMessage";
const ERROR_LOG_TYPE = 1;

function isResponse(msg: Message): msg is ResponseMessage {
	return "id" in msg && ("result" in msg || "error" in msg);
}

function isNotification(msg: Message): msg is NotificationMessage {
	return "method" in msg && !("id" in msg);
}

function isErrorLog(msg: Message): msg is NotificationMessage {
	if (!isNotification(msg) || msg.method !== LOG_MESSAGE_METHOD) {
		return false;
	}
	const { params } = msg;
	return (
		typeof params === "object"
		&& params !== null
		&& "type" in params
		&& params.type === ERROR_LOG_TYPE
	);
}

function buildRequest(id: number, method: string, params: object | unknown[] | undefined): RequestMessage {
	if (params === undefined) {
		return { jsonrpc: "2.0", id, method };
	}
	return { jsonrpc: "2.0", id, method, params };
}

function buildNotification(method: string, params: object | unknown[] | undefined): NotificationMessage {
	if (params === undefined) {
		return { jsonrpc: "2.0", method };
	}
	return { jsonrpc: "2.0", method, params };
}

export interface LspTestHarness {
	request: (id: number, method: string, params?: object | unknown[]) => void;
	notify: (method: string, params?: object | unknown[]) => void;
	awaitResponse: (id: number, options?: AwaitMessageOptions) => Promise<ResponseMessage>;
	awaitNotification: (method: string, options?: AwaitMessageOptions) => Promise<NotificationMessage>;
	awaitErrorLog: (options?: AwaitMessageOptions) => Promise<NotificationMessage>;
	cursor: () => number;
	allMessages: () => readonly Message[];
}

export function createLspTestHarness(getAnalyzer: () => Promise<RecipeAnalyzer>): LspTestHarness {
	const reader = new TestMessageReader();
	const writer = new TestMessageWriter();
	const connection = createConnection(reader, writer);
	startRecipeServer(connection, getAnalyzer);

	return {
		request(id: number, method: string, params?: object | unknown[]): void {
			reader.emit(buildRequest(id, method, params));
		},
		notify(method: string, params?: object | unknown[]): void {
			reader.emit(buildNotification(method, params));
		},
		awaitResponse(id: number, options?: AwaitMessageOptions): Promise<ResponseMessage> {
			return writer.awaitMessage(
				(msg): msg is ResponseMessage => isResponse(msg) && msg.id === id,
				options,
			);
		},
		awaitNotification(method: string, options?: AwaitMessageOptions): Promise<NotificationMessage> {
			return writer.awaitMessage(
				(msg): msg is NotificationMessage => isNotification(msg) && msg.method === method,
				options,
			);
		},
		awaitErrorLog(options?: AwaitMessageOptions): Promise<NotificationMessage> {
			return writer.awaitMessage(isErrorLog, options);
		},
		cursor(): number {
			return writer.messages.length;
		},
		allMessages(): readonly Message[] {
			return writer.messages;
		},
	};
}
