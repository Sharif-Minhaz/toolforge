import { describe, expect, test } from "bun:test";

import {
    byteToAscii,
    byteToHex,
    columnForOffset,
    formatHexDump,
    formatOffset,
    hexDigitValue,
    isPrintableAscii,
    nibbleToHex,
    rowCount,
    rowForOffset,
    rowStartOffset,
} from "@/modules/hex-editor/domain/format";

describe("byteToHex", () => {
    /**
     * Cross-checked against Node's own hex writer rather than against a second
     * copy of the same lookup table — `Buffer` is an independent implementation,
     * which is the whole point of checking.
     */
    test("agrees with Buffer's hex for every byte", () => {
        for (let value = 0; value < 256; value += 1) {
            expect(byteToHex(value)).toBe(Buffer.from([value]).toString("hex").toUpperCase());
        }
    });

    test("is always two digits", () => {
        expect(byteToHex(0)).toBe("00");
        expect(byteToHex(0x0f)).toBe("0F");
        expect(byteToHex(0xff)).toBe("FF");
    });
});

describe("nibbleToHex and hexDigitValue", () => {
    test("round-trips every digit, in either case", () => {
        for (let value = 0; value < 16; value += 1) {
            const digit = nibbleToHex(value);

            expect(hexDigitValue(digit)).toBe(value);
            expect(hexDigitValue(digit.toLowerCase())).toBe(value);
        }
    });

    test("refuses anything that is not a hex digit", () => {
        expect(hexDigitValue("g")).toBeNull();
        expect(hexDigitValue(" ")).toBeNull();
        expect(hexDigitValue("")).toBeNull();
    });
});

describe("byteToAscii", () => {
    test("shows printable ASCII as itself", () => {
        expect(byteToAscii(0x48)).toBe("H");
        expect(byteToAscii(32)).toBe(" ");
        expect(byteToAscii(126)).toBe("~");
    });

    test("shows everything else as a dot", () => {
        expect(byteToAscii(0)).toBe(".");
        expect(byteToAscii(31)).toBe(".");
        expect(byteToAscii(127)).toBe(".");
        expect(byteToAscii(0xff)).toBe(".");
    });

    test("agrees with the printable predicate", () => {
        for (let value = 0; value < 256; value += 1) {
            expect(byteToAscii(value) === ".").toBe(!isPrintableAscii(value) || value === 46);
        }
    });
});

describe("formatOffset", () => {
    test("pads to eight uppercase digits", () => {
        expect(formatOffset(0)).toBe("00000000");
        expect(formatOffset(0x20)).toBe("00000020");
        expect(formatOffset(0xdeadbeef)).toBe("DEADBEEF");
    });
});

describe("row arithmetic", () => {
    test("maps an offset onto its row and column", () => {
        expect(rowForOffset(0)).toBe(0);
        expect(rowForOffset(15)).toBe(0);
        expect(rowForOffset(16)).toBe(1);
        expect(columnForOffset(0x21)).toBe(1);
        expect(rowStartOffset(2)).toBe(32);
    });

    test("counts rows, and gives an empty document one", () => {
        expect(rowCount(0)).toBe(1);
        expect(rowCount(1)).toBe(1);
        expect(rowCount(16)).toBe(1);
        expect(rowCount(17)).toBe(2);
    });
});

describe("formatHexDump", () => {
    test("writes offset, sixteen bytes and the ASCII column", () => {
        const bytes = Uint8Array.from([
            0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0xff, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21,
            0x0a, 0x00,
        ]);

        expect(formatHexDump(bytes, 0x20)).toBe(
            "00000020  48 65 6C 6C 6F 20 FF 00  57 6F 72 6C 64 21 0A 00  Hello ..World!..",
        );
    });

    /**
     * A short row pads with spaces rather than stopping early, so a dump pasted
     * into a terminal still lines its ASCII column up with the rows above it.
     */
    test("keeps a short final row aligned", () => {
        const short = formatHexDump(Uint8Array.from([0x41, 0x42]));
        const full = formatHexDump(new Uint8Array(16));

        expect(short.endsWith("  AB")).toBe(true);
        expect(short.indexOf("AB", 10)).toBe(full.length - 16);
    });

    test("writes one line per sixteen bytes", () => {
        expect(formatHexDump(new Uint8Array(33)).split("\n")).toHaveLength(3);
    });

    test("writes nothing for no bytes", () => {
        expect(formatHexDump(new Uint8Array(0))).toBe("");
    });
});
