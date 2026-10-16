import { describe, expect, test } from "bun:test";

import { keyboardTesterSearchParamsSchema } from "@/modules/keyboard-tester/validation/search-params";

describe("keyboardTesterSearchParamsSchema", () => {
    test("reads a shared board", () => {
        expect(
            keyboardTesterSearchParamsSchema.parse({
                size: "tkl",
                standard: "iso",
                os: "mac",
                window: "30",
            }),
        ).toEqual({ size: "tkl", standard: "iso", os: "mac", window: 30 });
    });

    test("drops each bad field on its own", () => {
        expect(
            keyboardTesterSearchParamsSchema.parse({ size: "40", standard: "iso", window: "33" }),
        ).toEqual({ size: undefined, standard: "iso", os: undefined, window: undefined });
    });
});
