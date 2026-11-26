import { describe, expect, test } from "bun:test";

import { chmodSearchParamsSchema } from "@/modules/chmod/validation/chmod-options";

describe("chmod search params", () => {
    test("reads a shared mode", () => {
        expect(chmodSearchParamsSchema.parse({ mode: "4755" })).toEqual({ mode: "4755" });
    });

    test("degrades a malformed value to the default instead of throwing the page away", () => {
        expect(chmodSearchParamsSchema.parse({ mode: ["755", "644"] })).toEqual({
            mode: undefined,
        });
        expect(chmodSearchParamsSchema.parse({ mode: "7".repeat(64) })).toEqual({
            mode: undefined,
        });
        expect(chmodSearchParamsSchema.parse({})).toEqual({ mode: undefined });
    });
});
