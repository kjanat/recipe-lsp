import { describe, expect, test } from "bun:test";

import { evaluateNodeCliArgs } from "#server/node-cli.ts";

describe("evaluateNodeCliArgs", () => {
	test("prints help for --help", () => {
		const result = evaluateNodeCliArgs(["--help"]);
		expect(result).toMatchObject({ kind: "exit", code: 0, stream: "stdout" });
		if (result.kind !== "exit") {
			throw new Error("expected exit result");
		}
		expect(result.message).toContain("Usage:");
		expect(result.message).toContain("--stdio");
	});

	test("rejects missing transport", () => {
		const result = evaluateNodeCliArgs([]);
		expect(result).toMatchObject({ kind: "exit", code: 1, stream: "stderr" });
		if (result.kind !== "exit") {
			throw new Error("expected exit result");
		}
		expect(result.message).toContain("Missing transport flag");
	});

	test("rejects unknown args", () => {
		const result = evaluateNodeCliArgs(["--wat"]);
		expect(result).toMatchObject({ kind: "exit", code: 1, stream: "stderr" });
		if (result.kind !== "exit") {
			throw new Error("expected exit result");
		}
		expect(result.message).toContain("Unknown argument");
		expect(result.message).toContain("`--wat`");
	});

	test("rejects bad socket ports", () => {
		const result = evaluateNodeCliArgs(["--socket=nope"]);
		expect(result).toMatchObject({ kind: "exit", code: 1, stream: "stderr" });
		if (result.kind !== "exit") {
			throw new Error("expected exit result");
		}
		expect(result.message).toContain("Bad socket port");
	});

	test("rejects multiple transports", () => {
		const result = evaluateNodeCliArgs(["--stdio", "--node-ipc"]);
		expect(result).toMatchObject({ kind: "exit", code: 1, stream: "stderr" });
		if (result.kind !== "exit") {
			throw new Error("expected exit result");
		}
		expect(result.message).toContain("Choose exactly one transport flag");
	});

	test("accepts supported transports", () => {
		expect(evaluateNodeCliArgs(["--stdio"])).toEqual({ kind: "start" });
		expect(evaluateNodeCliArgs(["--node-ipc"])).toEqual({ kind: "start" });
		expect(evaluateNodeCliArgs(["--socket=3000"])).toEqual({ kind: "start" });
	});
});
