import { type ResolvedTransport, resolveTransport, type TransportInput } from "#server/node-cli.ts";

import { describe, expect, test } from "bun:test";

function resolve(overrides: Partial<TransportInput>): ResolvedTransport {
	return resolveTransport({
		arg: undefined,
		port: undefined,
		stdio: false,
		nodeIpc: false,
		socket: undefined,
		...overrides,
	});
}

describe("resolveTransport", () => {
	test("defaults to stdio when nothing is given", () => {
		expect(resolve({})).toEqual({ kind: "stdio" });
	});

	test("resolves the positional transport", () => {
		expect(resolve({ arg: "stdio" })).toEqual({ kind: "stdio" });
		expect(resolve({ arg: "node-ipc" })).toEqual({ kind: "node-ipc" });
		expect(resolve({ arg: "socket", port: 2087 })).toEqual({ kind: "socket", port: 2087 });
	});

	test("resolves the LSP-conventional flag aliases", () => {
		expect(resolve({ stdio: true })).toEqual({ kind: "stdio" });
		expect(resolve({ nodeIpc: true })).toEqual({ kind: "node-ipc" });
		expect(resolve({ socket: 2087 })).toEqual({ kind: "socket", port: 2087 });
	});

	test("requires a port for the socket transport", () => {
		expect(() => resolve({ arg: "socket" })).toThrow("needs a port");
	});

	test("rejects an out-of-range socket port", () => {
		expect(() => resolve({ socket: 99999 })).toThrow("Bad socket port");
		expect(() => resolve({ arg: "socket", port: 0 })).toThrow("Bad socket port");
	});

	test("rejects naming more than one transport", () => {
		expect(() => resolve({ arg: "node-ipc", stdio: true })).toThrow("Choose one transport");
		expect(() => resolve({ stdio: true, socket: 2087 })).toThrow("Choose one transport");
	});
});
