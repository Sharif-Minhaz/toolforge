import { describe, expect, test } from "bun:test";

import { DEFAULT_FORMAT_OPTIONS, MAX_JSON_INPUT_BYTES } from "@/modules/json/domain/constants";
import {
    describeSizeDelta,
    formatJson,
    type JsonFormatResult,
    type JsonSizeDelta,
} from "@/modules/json/domain/format";
import type { JsonFormatOptions, JsonMode } from "@/modules/json/types";

function run(
    mode: JsonMode,
    input: string,
    overrides: Partial<JsonFormatOptions> = {},
): JsonFormatResult {
    return formatJson({ mode, input, options: { ...DEFAULT_FORMAT_OPTIONS, ...overrides } });
}

function outputOf(mode: JsonMode, input: string, overrides: Partial<JsonFormatOptions> = {}) {
    const result = run(mode, input, overrides);

    if (!result.ok) {
        throw new Error(`expected success, got ${result.error.code}`);
    }

    return result;
}

function failureOf(mode: JsonMode, input: string, overrides: Partial<JsonFormatOptions> = {}) {
    const result = run(mode, input, overrides);

    if (result.ok) {
        throw new Error("expected a failure");
    }

    return result.error;
}

describe("formatJson — modes", () => {
    test("beautify indents with the chosen template", () => {
        expect(outputOf("beautify", '{"a":1}', { indent: "space4" }).output).toBe(
            '{\n    "a": 1\n}',
        );
        expect(outputOf("beautify", '{"a":1}', { indent: "tab" }).output).toBe('{\n\t"a": 1\n}');
    });

    test("minify ignores the indent template entirely", () => {
        for (const indent of ["space2", "space3", "space4", "tab"] as const) {
            expect(outputOf("minify", '{\n  "a": [1, 2]\n}', { indent }).output).toBe(
                '{"a":[1,2]}',
            );
        }
    });

    test("validate reports without producing output", () => {
        const result = outputOf("validate", '{"a":1}');

        expect(result.output).toBe("");
        expect(result.outputBytes).toBe(0);
        expect(result.stats.keys).toBe(1);
    });
});

describe("formatJson — sizes", () => {
    test("measures input and output in UTF-8 bytes", () => {
        const result = outputOf("minify", '{ "a": "é" }');

        expect(result.inputBytes).toBe(13);
        expect(result.outputBytes).toBe(10);
    });

    test("reports the input size even when the document does not parse", () => {
        const result = run("beautify", "{oops");

        expect(result.ok).toBe(false);
        expect(result.inputBytes).toBe(5);
    });
});

describe("formatJson — document-level failures", () => {
    test("treats an empty box as empty rather than a syntax error", () => {
        expect(failureOf("beautify", "").code).toBe("empty");
        expect(failureOf("beautify", "   \n  ").code).toBe("empty");
    });

    test("refuses a document past the byte ceiling", () => {
        const oversized = `["${"a".repeat(MAX_JSON_INPUT_BYTES)}"]`;

        expect(failureOf("beautify", oversized).code).toBe("too_large");
    });

    test("accepts a document exactly at the ceiling", () => {
        const padding = MAX_JSON_INPUT_BYTES - 4;
        const exact = `["${"a".repeat(padding)}"]`;

        expect(run("minify", exact).ok).toBe(true);
    });
});

describe("formatJson — specification rules", () => {
    for (const spec of ["rfc8259", "rfc7159", "ecma404"] as const) {
        test(`${spec} accepts a bare value at the top level`, () => {
            expect(run("beautify", '"text"', { spec }).ok).toBe(true);
            expect(run("beautify", "42", { spec }).ok).toBe(true);
        });
    }

    test("rfc4627 requires an object or an array at the top level", () => {
        expect(failureOf("beautify", '"text"', { spec: "rfc4627" }).code).toBe(
            "root_not_container",
        );
        expect(run("beautify", '{"a":1}', { spec: "rfc4627" }).ok).toBe(true);
        expect(run("beautify", "[1]", { spec: "rfc4627" }).ok).toBe(true);
    });

    test("rfc8259 rejects a lone surrogate that the others only warn about", () => {
        const input = '{"a":"\\ud800"}';

        expect(failureOf("beautify", input, { spec: "rfc8259" }).code).toBe("unpaired_surrogate");

        for (const spec of ["rfc7159", "rfc4627", "ecma404"] as const) {
            const result = outputOf("beautify", input, { spec });

            expect(result.advisories.map((advisory) => advisory.code)).toEqual([
                "unpaired_surrogate",
            ]);
        }
    });

    test("rfc7159 and ecma404 describe the same grammar, so they agree everywhere", () => {
        for (const input of ['{"a":1}', "[1,2]", '"x"', "3", "true", "null", '{"a":"\\ud800"}']) {
            expect(JSON.stringify(run("beautify", input, { spec: "rfc7159" }))).toBe(
                JSON.stringify(run("beautify", input, { spec: "ecma404" })),
            );
        }
    });
});

describe("formatJson — options", () => {
    test("sortKeys applies in every output mode", () => {
        expect(outputOf("minify", '{"b":1,"a":2}', { sortKeys: true }).output).toBe(
            '{"a":2,"b":1}',
        );
        expect(outputOf("beautify", '{"b":1,"a":2}', { sortKeys: true }).output).toBe(
            '{\n  "a": 2,\n  "b": 1\n}',
        );
    });

    test("escapeUnicode leaves the document readable as ASCII", () => {
        const output = outputOf("minify", '{"a":"héllo"}', { escapeUnicode: true }).output;

        expect(/^[\x00-\x7f]*$/.test(output)).toBe(true);
        expect(JSON.parse(output)).toEqual({ a: "héllo" });
    });

    test("repair turns a broken paste into valid output and says what it fixed", () => {
        const result = outputOf("minify", "{a:1, 'b':[2,], /* note */ c:True}", {
            repair: true,
        });

        expect(result.output).toBe('{"a":1,"b":[2],"c":true}');
        expect(new Set(result.repairs.map((repair) => repair.code))).toEqual(
            new Set([
                "unquoted_key",
                "non_standard_quote",
                "trailing_comma",
                "comment",
                "non_standard_literal",
            ]),
        );
    });

    test("repair off leaves the same paste failing, with a repairable code", () => {
        expect(failureOf("minify", "{a:1}").code).toBe("unquoted_key");
    });

    test("repair reports nothing when the input was already valid", () => {
        expect(outputOf("minify", '{"a":1}', { repair: true }).repairs).toEqual([]);
    });
});

describe("formatJson — advisories", () => {
    test("surfaces a repeated member name without failing", () => {
        const result = outputOf("validate", '{"a":1,"a":2}');

        expect(result.advisories.map((advisory) => advisory.code)).toEqual(["duplicate_key"]);
    });

    test("surfaces a number a JSON.parse consumer would round", () => {
        const result = outputOf("validate", '{"id":12345678901234567890}');

        expect(result.advisories).toEqual([
            {
                code: "precision_loss",
                literal: "12345678901234567890",
                line: 1,
                column: 7,
                offset: 6,
            },
        ]);
    });
});

describe("formatJson — statistics", () => {
    test("counts what a document is made of", () => {
        const result = outputOf("validate", '{"a":[1,2,"x"],"b":{"c":true,"d":null},"e":"y"}');

        expect(result.stats).toEqual({
            objects: 2,
            arrays: 1,
            keys: 5,
            strings: 2,
            numbers: 2,
            booleans: 1,
            nulls: 1,
            depth: 2,
        });
    });

    test("gives a scalar document a depth of zero", () => {
        expect(outputOf("validate", '"x"').stats.depth).toBe(0);
    });

    test("counts an empty container as one level", () => {
        expect(outputOf("validate", "{}").stats.depth).toBe(1);
        expect(outputOf("validate", '{"a":{}}').stats.depth).toBe(2);
    });
});

describe("describeSizeDelta", () => {
    for (const [input, output, expected] of [
        [100, 60, { direction: "smaller", percent: 40 }],
        [100, 140, { direction: "larger", percent: 40 }],
        [100, 100, { direction: "same", percent: 0 }],
        // Under half a percent rounds away, so a three-byte saving on a large
        // document does not get announced as a win.
        [1000, 997, { direction: "same", percent: 0 }],
        [0, 0, { direction: "same", percent: 0 }],
        [0, 50, { direction: "same", percent: 0 }],
    ] as [number, number, JsonSizeDelta][]) {
        test(`${input} → ${output} reads as ${expected.percent}% ${expected.direction}`, () => {
            expect(describeSizeDelta(input, output)).toEqual(expected);
        });
    }

    test("agrees with the bytes a real minify produced", () => {
        const result = outputOf("minify", '{\n  "a": 1,\n  "b": 2\n}');

        expect(describeSizeDelta(result.inputBytes, result.outputBytes).direction).toBe("smaller");
    });
});

describe("formatJson — determinism", () => {
    test("the same request always produces the same result", () => {
        const request = {
            mode: "beautify" as const,
            input: '{"b":1,"a":[2,3]}',
            options: DEFAULT_FORMAT_OPTIONS,
        };

        expect(JSON.stringify(formatJson(request))).toBe(JSON.stringify(formatJson(request)));
    });

    test("beautify and minify agree on the value they describe", () => {
        const input = '{"a":[1,{"b":"x"}],"c":null}';

        expect(JSON.parse(outputOf("beautify", input).output)).toEqual(
            JSON.parse(outputOf("minify", input).output),
        );
    });
});
