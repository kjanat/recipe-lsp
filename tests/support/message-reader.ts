import { AbstractMessageReader } from "vscode-jsonrpc";
import type { DataCallback, Disposable, Message, MessageReader } from "vscode-jsonrpc";

export class TestMessageReader extends AbstractMessageReader implements MessageReader {
	#callback: DataCallback | undefined;

	override listen(callback: DataCallback): Disposable {
		this.#callback = callback;
		return {
			dispose: (): void => {
				this.#callback = undefined;
			},
		};
	}

	emit(message: Message): void {
		this.#callback?.(message);
	}
}
