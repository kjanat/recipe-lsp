import {
	AbstractMessageReader,
	type DataCallback,
	type Disposable,
	type Message,
	type MessageReader,
} from "vscode-jsonrpc";

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
