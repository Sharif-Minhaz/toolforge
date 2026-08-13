import { describe, expect, test } from "bun:test";

import { timingSafeEqual } from "@/modules/tools/domain/timing-safe";

// Moved here with the function when the MCP endpoint became its second caller.
// Its assertions were written for hash comparison and hold unchanged for a
// bearer token, which is the argument for the function being shared at all.

describe("timingSafeEqual", () => {
    test("matches identical strings", () => {
        expect(timingSafeEqual("deadbeef", "deadbeef")).toBe(true);
    });

    test("rejects a single differing character", () => {
        expect(timingSafeEqual("deadbeef", "deadbeee")).toBe(false);
    });

    test("rejects strings of different lengths", () => {
        expect(timingSafeEqual("dead", "deadbeef")).toBe(false);
    });

    test("treats two empty strings as equal", () => {
        expect(timingSafeEqual("", "")).toBe(true);
    });

    test("is case-sensitive, because base64 digests and tokens both are", () => {
        expect(timingSafeEqual("Zm9v", "zm9V")).toBe(false);
    });
});
