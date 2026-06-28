import type { Message, MessageWriter } from "vscode-jsonrpc";
import { AbstractMessageWriter } from "vscode-jsonrpc";

const DEFAULT_AWAIT_TIMEOUT_MS = 1000;

export interface AwaitMessageOptions {
	after?: number;
	timeoutMs?: number;
}

export class TestMessageWriter extends AbstractMessageWriter implements MessageWriter {
	readonly messages: Message[] = [];
	readonly #waiters = new Set<() => void>();

	write(message: Message): Promise<void> {
		this.messages.push(message);
		for (const waiter of [...this.#waiters]) {
			waiter();
		}
		return Promise.resolve();
	}

	end(): void {
		this.#waiters.clear();
	}

	awaitMessage<T extends Message>(
		predicate: (msg: Message) => msg is T,
		options: AwaitMessageOptions = {},
	): Promise<T> {
		const after = options.after ?? 0;
		const timeoutMs = options.timeoutMs ?? DEFAULT_AWAIT_TIMEOUT_MS;
		return new Promise((resolve, reject) => {
			const tryFind = (): T | undefined => {
				for (let i = after; i < this.messages.length; i += 1) {
					const candidate = this.messages[i];
					if (candidate !== undefined && predicate(candidate)) {
						return candidate;
					}
				}
			};

			const existing = tryFind();
			if (existing) {
				resolve(existing);
				return;
			}

			const waiter = (): void => {
				const found = tryFind();
				if (found) {
					this.#waiters.delete(waiter);
					resolve(found);
				}
			};
			this.#waiters.add(waiter);

			setTimeout(() => {
				this.#waiters.delete(waiter);
				reject(new Error("timeout waiting for LSP message"));
			}, timeoutMs);
		});
	}
}
