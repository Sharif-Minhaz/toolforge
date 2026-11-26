import { describe, expect, test } from "bun:test";

import { MAX_MODE } from "@/modules/chmod/domain/constants";
import { formatOctal, formatSymbolic } from "@/modules/chmod/domain/mode";
import { parseMode, parseOctalMode, parseSymbolicMode } from "@/modules/chmod/domain/parse";

describe("parseOctalMode", () => {
    test("reads three and four digits, with or without a leading zero", () => {
        expect(parseOctalMode("755")).toEqual({ ok: true, mode: 0o755 });
        expect(parseOctalMode("0755")).toEqual({ ok: true, mode: 0o755 });
        expect(parseOctalMode("00755")).toEqual({ ok: true, mode: 0o755 });
        expect(parseOctalMode("4755")).toEqual({ ok: true, mode: 0o4755 });
        expect(parseOctalMode(" 7777 ")).toEqual({ ok: true, mode: MAX_MODE });
    });

    test("right-aligns a short number the way GNU chmod does", () => {
        expect(parseOctalMode("7")).toEqual({ ok: true, mode: 0o007 });
        expect(parseOctalMode("44")).toEqual({ ok: true, mode: 0o044 });
        expect(parseOctalMode("0")).toEqual({ ok: true, mode: 0 });
    });

    test("names each refusal", () => {
        expect(parseOctalMode("")).toEqual({ ok: false, reason: "empty" });
        expect(parseOctalMode("   ")).toEqual({ ok: false, reason: "empty" });
        expect(parseOctalMode("758")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 3,
        });
        expect(parseOctalMode("0o755")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 2,
        });
        expect(parseOctalMode("17777")).toEqual({ ok: false, reason: "out_of_range" });
    });

    test("counts the position in characters, not UTF-16 units", () => {
        expect(parseOctalMode("🙂9")).toMatchObject({ reason: "invalid_character", position: 1 });
        expect(parseOctalMode("7🙂")).toMatchObject({ reason: "invalid_character", position: 2 });
    });
});

describe("parseSymbolicMode", () => {
    test("reads nine characters, and a whole ls -l column", () => {
        expect(parseSymbolicMode("rwxr-xr-x")).toEqual({ ok: true, mode: 0o755 });
        expect(parseSymbolicMode("-rwsr-xr-x")).toEqual({ ok: true, mode: 0o4755 });
        expect(parseSymbolicMode("drwxrwxrwt")).toEqual({ ok: true, mode: 0o1777 });
        expect(parseSymbolicMode("drwxr-sr-x.")).toEqual({ ok: true, mode: 0o2755 });
        expect(parseSymbolicMode("-rw-r--r--@")).toEqual({ ok: true, mode: 0o644 });
        expect(parseSymbolicMode("rw-r--r--+")).toEqual({ ok: true, mode: 0o644 });
    });

    test("tells a special bit without execute from one with it", () => {
        expect(parseSymbolicMode("rwSr--r--")).toEqual({ ok: true, mode: 0o4644 });
        expect(parseSymbolicMode("rwxr-Sr-x")).toEqual({ ok: true, mode: 0o2745 });
        expect(parseSymbolicMode("rwxrwxrwT")).toEqual({ ok: true, mode: 0o1776 });
    });

    test("refuses a character outside its slot, and says what the slot takes", () => {
        expect(parseSymbolicMode("rwxr-xr-s")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 9,
            expected: ["x", "t", "T", "-"],
        });
        expect(parseSymbolicMode("-wrxr-xr-x")).toEqual({
            ok: false,
            reason: "invalid_character",
            position: 2,
            expected: ["r", "-"],
        });
        expect(parseSymbolicMode("RWXR-XR-X")).toMatchObject({
            reason: "invalid_character",
            position: 1,
        });
    });

    test("refuses the wrong length, including an unknown file type", () => {
        expect(parseSymbolicMode("")).toEqual({ ok: false, reason: "empty" });
        expect(parseSymbolicMode("rwx")).toEqual({ ok: false, reason: "invalid_length" });
        expect(parseSymbolicMode("xrwxr-xr-x")).toEqual({ ok: false, reason: "invalid_length" });
        expect(parseSymbolicMode("rwx r-x r-x")).toEqual({ ok: false, reason: "invalid_length" });
    });
});

describe("parseMode", () => {
    test("reads a leading digit as octal and anything else as symbolic", () => {
        expect(parseMode("640")).toEqual({ ok: true, mode: 0o640 });
        expect(parseMode("rw-r-----")).toEqual({ ok: true, mode: 0o640 });
        expect(parseMode("64x")).toMatchObject({ reason: "invalid_character", position: 3 });
        expect(parseMode("")).toEqual({ ok: false, reason: "empty" });
    });
});

describe("round trips", () => {
    test("every one of the 4096 modes survives both formats", () => {
        for (let mode = 0; mode <= MAX_MODE; mode++) {
            expect(parseOctalMode(formatOctal(mode))).toEqual({ ok: true, mode });
            expect(parseSymbolicMode(formatSymbolic(mode))).toEqual({ ok: true, mode });
        }
    });
});
