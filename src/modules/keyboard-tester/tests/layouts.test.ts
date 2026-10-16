import { describe, expect, test } from "bun:test";

import { labelScale } from "@/modules/keyboard-tester/domain/labels";
import { buildLayout } from "@/modules/keyboard-tester/domain/layouts";
import {
    KEYBOARD_SIZES,
    KEYBOARD_STANDARDS,
    type LayoutKey,
} from "@/modules/keyboard-tester/types";

function overlaps(a: LayoutKey, b: LayoutKey): boolean {
    const eps = 1e-9;

    return (
        a.x < b.x + b.w - eps &&
        b.x < a.x + a.w - eps &&
        a.y < b.y + b.h - eps &&
        b.y < a.y + a.h - eps
    );
}

describe("buildLayout", () => {
    test("counts the keys a real board of each size has", () => {
        expect(buildLayout("full", "ansi").codes).toHaveLength(104);
        expect(buildLayout("full", "iso").codes).toHaveLength(105);
        expect(buildLayout("tkl", "ansi").codes).toHaveLength(87);
        expect(buildLayout("60", "ansi").codes).toHaveLength(60);
    });

    test("lists every code once", () => {
        for (const size of KEYBOARD_SIZES) {
            for (const standard of KEYBOARD_STANDARDS) {
                const { codes } = buildLayout(size, standard);

                expect(new Set(codes).size).toBe(codes.length);
            }
        }
    });

    test("never draws two keys on top of each other", () => {
        for (const size of KEYBOARD_SIZES) {
            for (const standard of KEYBOARD_STANDARDS) {
                const { keys } = buildLayout(size, standard);

                for (let i = 0; i < keys.length; i += 1) {
                    for (let j = i + 1; j < keys.length; j += 1) {
                        // The ISO Enter's box covers the notch Backslash sits in.
                        const iso = keys[i].shape === "isoEnter" || keys[j].shape === "isoEnter";
                        const notch =
                            iso && (keys[i].code === "Backslash" || keys[j].code === "Backslash");

                        if (!notch) {
                            expect(overlaps(keys[i], keys[j])).toBe(false);
                        }
                    }
                }
            }
        }
    });

    test("keeps the alphanumeric block fifteen units wide", () => {
        for (const size of KEYBOARD_SIZES) {
            for (const standard of KEYBOARD_STANDARDS) {
                const { keys } = buildLayout(size, standard);
                const space = keys.find((key) => key.code === "Space");
                const backspace = keys.find((key) => key.code === "Backspace");

                expect(backspace && backspace.x + backspace.w).toBe(15);
                expect(space?.w).toBe(6.25);
            }
        }
    });

    test("moves only what ISO moves", () => {
        const ansi = new Set(buildLayout("tkl", "ansi").codes);
        const iso = new Set(buildLayout("tkl", "iso").codes);

        expect([...iso].filter((code) => !ansi.has(code))).toEqual(["IntlBackslash"]);
        expect([...ansi].filter((code) => !iso.has(code))).toEqual([]);
    });

    test("leaves the lights' corner empty, and only on a full-size board", () => {
        const full = buildLayout("full", "ansi");
        const area = full.indicatorArea;

        expect(area).not.toBeNull();
        expect(
            full.keys.some(
                (key) =>
                    area !== null &&
                    key.x < area.x + area.w &&
                    area.x < key.x + key.w &&
                    key.y < area.y + area.h &&
                    area.y < key.y + key.h,
            ),
        ).toBe(false);
        expect(buildLayout("tkl", "ansi").indicatorArea).toBeNull();
    });

    test("leaves the Fn key undrawn as a code, because nothing reports it", () => {
        const fn = buildLayout("65", "ansi").keys.filter((key) => key.code === null);

        expect(fn).toHaveLength(1);
        expect(buildLayout("full", "ansi").keys.some((key) => key.code === null)).toBe(false);
    });
});

describe("labelScale", () => {
    test("leaves short caps at full size and shrinks long ones to fit", () => {
        expect(labelScale(1, "Ins")).toBe(1);
        expect(labelScale(1, "Home")).toBeLessThan(1);
        expect(labelScale(1, "PrtSc")).toBeLessThan(labelScale(1, "Home"));
        expect(labelScale(6.25, "Space")).toBe(1);
        expect(labelScale(1, "AudioVolumeUp")).toBe(0.55);
    });
});
