import { describe, expect, test } from "bun:test";

import { DEFAULT_FORMAT_OPTIONS } from "@/modules/json/domain/constants";
import {
    formatJson,
    type JsonFormatRequest,
    type JsonFormatResult,
} from "@/modules/json/domain/format";
import type { JsonMode } from "@/modules/json/types";

/**
 * The formatter runs in a worker, so every request and every result crosses a
 * `postMessage` boundary. Structured clone accepts plain data and throws on
 * everything else — a function, a class instance, a getter-backed node. These
 * tests fail the moment something un-cloneable is added to either shape, which
 * is the only warning available: in the browser the same mistake surfaces as a
 * `DataCloneError` at runtime, on one document, in one mode.
 */

const MODES: readonly JsonMode[] = ["beautify", "minify", "validate"];

const DOCUMENTS: readonly { readonly label: string; readonly input: string }[] = [
    { label: "empty", input: "" },
    { label: "object", input: '{"a":1,"b":[true,null,"x"],"c":{"d":2}}' },
    { label: "scalar root", input: "42" },
    { label: "unicode", input: '{"greeting":"héllo 🚀"}' },
    // Carries advisories: a duplicate key and an integer past the safe range.
    { label: "advisory-bearing", input: '{"a":1,"a":2,"big":9007199254740993}' },
    // Carries repairs, which only appear when repair is on.
    { label: "repairable", input: "{'a': 1, b: 2,}" },
    { label: "invalid", input: '{"a":}' },
    { label: "too deep", input: `${"[".repeat(600)}1${"]".repeat(600)}` },
];

function requestsFor(document: string): readonly JsonFormatRequest[] {
    return MODES.flatMap((mode) => [
        { mode, input: document, options: DEFAULT_FORMAT_OPTIONS },
        { mode, input: document, options: { ...DEFAULT_FORMAT_OPTIONS, repair: true } },
    ]);
}

describe("worker boundary", () => {
    test("every request survives structured clone unchanged", () => {
        for (const { label, input } of DOCUMENTS) {
            for (const request of requestsFor(input)) {
                const cloned: JsonFormatRequest = structuredClone(request);

                expect(cloned, `${label} / ${request.mode}`).toEqual(request);
            }
        }
    });

    test("every result survives structured clone unchanged", () => {
        for (const { label, input } of DOCUMENTS) {
            for (const request of requestsFor(input)) {
                const result = formatJson(request);
                const cloned: JsonFormatResult = structuredClone(result);

                expect(cloned, `${label} / ${request.mode}`).toEqual(result);
            }
        }
    });

    test("a cloned result still reads as the result it was", () => {
        const result = formatJson({
            mode: "beautify",
            input: '{"a":1,"a":2}',
            options: DEFAULT_FORMAT_OPTIONS,
        });

        if (!result.ok) {
            throw new Error(`expected success, got ${result.error.code}`);
        }

        const cloned = structuredClone(result);

        if (!cloned.ok) {
            throw new Error("clone lost the success discriminant");
        }

        expect(cloned.output).toBe(result.output);
        expect(cloned.stats).toEqual(result.stats);
        expect(cloned.advisories.length).toBe(result.advisories.length);
        expect(cloned.inputBytes).toBe(result.inputBytes);
        expect(cloned.outputBytes).toBe(result.outputBytes);
    });
});
