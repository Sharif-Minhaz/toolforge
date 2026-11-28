import { describe, expect, test } from "bun:test";

import {
    heightSchema,
    modelSearchParamsSchema,
    workerResponseSchema,
} from "@/modules/image-to-3d/validation/model-options";

describe("modelSearchParamsSchema", () => {
    test("reads the two settings a link may carry", () => {
        expect(modelSearchParamsSchema.parse({ detail: "high", format: "stl" })).toEqual({
            detail: "high",
            format: "stl",
        });
    });

    test("drops one impossible value without throwing the rest away", () => {
        expect(modelSearchParamsSchema.parse({ detail: "ultra", format: "obj" })).toEqual({
            detail: undefined,
            format: "obj",
        });
    });

    test("ignores a repeated parameter rather than failing the page", () => {
        expect(modelSearchParamsSchema.parse({ format: ["glb", "stl"] }).format).toBeUndefined();
    });
});

describe("heightSchema", () => {
    test("accepts whole millimetres inside the range and nothing else", () => {
        expect(heightSchema.safeParse(120).success).toBe(true);
        expect(heightSchema.safeParse(120.5).success).toBe(false);
        expect(heightSchema.safeParse(5).success).toBe(false);
        expect(heightSchema.safeParse(5_000).success).toBe(false);
    });
});

describe("workerResponseSchema", () => {
    test("reads the content and the truncation flag out of a chat completion", () => {
        const parsed = workerResponseSchema.parse({
            model: "@cf/google/gemma-4-26b-a4b-it",
            result: {
                choices: [{ finish_reason: "stop", message: { content: "{}", reasoning: null } }],
                usage: { neurons: 30.9 },
            },
        });

        expect(parsed.result.choices[0].message.content).toBe("{}");
        expect(parsed.result.usage?.neurons).toBe(30.9);
    });

    test("refuses a completion with no choices, which still arrives as 200", () => {
        expect(workerResponseSchema.safeParse({ result: { choices: [] } }).success).toBe(false);
    });
});
