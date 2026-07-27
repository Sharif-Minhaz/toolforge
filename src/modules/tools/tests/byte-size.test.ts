import { describe, expect, test } from "bun:test";

import { describeByteSize, getByteLength } from "@/modules/tools/domain/byte-size";

describe("getByteLength", () => {
    for (const [text, expected] of [
        ["", 0],
        ["abc", 3],
        ["é", 2],
        ["ল", 3],
        ["🚀", 4],
    ] as const) {
        test(`counts ${expected} UTF-8 bytes for "${text}"`, () => {
            expect(getByteLength(text)).toBe(expected);
        });
    }
});

describe("describeByteSize", () => {
    for (const [bytes, expected] of [
        [0, { value: 0, unit: "b" }],
        [1023, { value: 1023, unit: "b" }],
        [1024, { value: 1, unit: "kb" }],
        [1536, { value: 1.5, unit: "kb" }],
        [1_048_575, { value: 1024, unit: "kb" }],
        [1_048_576, { value: 1, unit: "mb" }],
    ] as const) {
        test(`describes ${bytes} bytes as ${expected.value} ${expected.unit}`, () => {
            expect(describeByteSize(bytes)).toEqual(expected);
        });
    }
});
