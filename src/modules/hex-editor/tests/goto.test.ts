import { describe, expect, test } from "bun:test";

import { parseOffsetInput } from "@/modules/hex-editor/domain/goto";

const LENGTH = 4096;

describe("parseOffsetInput", () => {
    /**
     * The ambiguity is the decision: `200` is two hundred, not 0x200. A plain
     * number in a box is decimal even in a hex editor, because nothing on screen
     * would tell a reader that it had been read the other way.
     */
    test("reads a plain number as decimal", () => {
        expect(parseOffsetInput("512", LENGTH)).toEqual({ ok: true, offset: 512 });
        expect(parseOffsetInput("200", LENGTH)).toEqual({ ok: true, offset: 200 });
        expect(parseOffsetInput("0", LENGTH)).toEqual({ ok: true, offset: 0 });
    });

    test("reads a prefixed or suffixed number as hexadecimal", () => {
        expect(parseOffsetInput("0x200", LENGTH)).toEqual({ ok: true, offset: 512 });
        expect(parseOffsetInput("0X1f", LENGTH)).toEqual({ ok: true, offset: 31 });
        expect(parseOffsetInput("200h", LENGTH)).toEqual({ ok: true, offset: 512 });
    });

    test("ignores surrounding whitespace and a leading plus", () => {
        expect(parseOffsetInput("  0x10  ", LENGTH)).toEqual({ ok: true, offset: 16 });
        expect(parseOffsetInput("+64", LENGTH)).toEqual({ ok: true, offset: 64 });
    });

    test("refuses an empty box by name", () => {
        expect(parseOffsetInput("   ", LENGTH)).toEqual({ ok: false, reason: "empty" });
    });

    test("refuses anything that is not a number", () => {
        expect(parseOffsetInput("beef", LENGTH)).toEqual({ ok: false, reason: "not_a_number" });
        expect(parseOffsetInput("-4", LENGTH)).toEqual({ ok: false, reason: "not_a_number" });
        expect(parseOffsetInput("1.5", LENGTH)).toEqual({ ok: false, reason: "not_a_number" });
        expect(parseOffsetInput("0x", LENGTH)).toEqual({ ok: false, reason: "not_a_number" });
    });

    /** Past the end is a different mistake from a typo, and says so. */
    test("refuses an offset the document does not reach", () => {
        expect(parseOffsetInput("4096", LENGTH)).toEqual({ ok: false, reason: "out_of_range" });
        expect(parseOffsetInput("0", 0)).toEqual({ ok: false, reason: "out_of_range" });
    });

    test("accepts the last byte", () => {
        expect(parseOffsetInput("4095", LENGTH)).toEqual({ ok: true, offset: 4095 });
    });
});
