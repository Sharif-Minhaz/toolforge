import { describe, expect, test } from "bun:test";

import { combosFor, completedCombos } from "@/modules/keyboard-tester/domain/combos";
import { detectLayoutFamily, keyLabel } from "@/modules/keyboard-tester/domain/labels";
import { buildLayout } from "@/modules/keyboard-tester/domain/layouts";

describe("keyLabel", () => {
    test("prints the US caps by default", () => {
        expect(keyLabel("KeyQ", "windows")).toEqual({ main: "Q" });
        expect(keyLabel("Digit1", "windows")).toEqual({ main: "1", shifted: "!" });
        expect(keyLabel("Digit0", "windows")).toEqual({ main: "0", shifted: ")" });
        expect(keyLabel("Slash", "windows")).toEqual({ main: "/", shifted: "?" });
        expect(keyLabel("F7", "windows")).toEqual({ main: "F7" });
    });

    test("renames the modifiers for a Mac", () => {
        expect(keyLabel("MetaLeft", "windows").main).toBe("Win");
        expect(keyLabel("MetaLeft", "mac").main).toBe("⌘ cmd");
    });

    test("relabels character keys from the reader's own layout, and nothing else", () => {
        const german = new Map([
            ["KeyY", "z"],
            ["Semicolon", "ö"],
            ["ShiftLeft", "x"],
        ]);

        expect(keyLabel("KeyY", "windows", german)).toEqual({ main: "Z" });
        expect(keyLabel("Semicolon", "windows", german)).toEqual({ main: "Ö" });
        expect(keyLabel("ShiftLeft", "windows", german).main).toBe("Shift");
    });
});

describe("detectLayoutFamily", () => {
    const map = (entries: Record<string, string>) => new Map(Object.entries(entries));

    test("tells the common Latin layouts apart", () => {
        expect(detectLayoutFamily(map({ KeyQ: "q", KeyW: "w", KeyE: "e", KeyY: "y" }))).toBe(
            "qwerty",
        );
        expect(detectLayoutFamily(map({ KeyQ: "q", KeyW: "w", KeyE: "e", KeyY: "z" }))).toBe(
            "qwertz",
        );
        expect(detectLayoutFamily(map({ KeyQ: "a", KeyW: "z" }))).toBe("azerty");
        expect(detectLayoutFamily(map({ KeyQ: "'", KeyW: "," }))).toBe("dvorak");
        expect(detectLayoutFamily(map({ KeyQ: "q", KeyW: "w", KeyE: "f", KeyY: "j" }))).toBe(
            "colemak",
        );
    });

    test("calls a non-Latin layout other", () => {
        expect(detectLayoutFamily(map({ KeyQ: "ঙ", KeyW: "য" }))).toBe("other");
    });
});

describe("combos", () => {
    test("offers only the chords the drawn board can play", () => {
        const sixty = combosFor(buildLayout("60", "ansi").codes).map((combo) => combo.id);

        expect(sixty).not.toContain("arrowsSpace");
        expect(sixty).toContain("wasd");
    });

    test("completes a chord once, when all of it is down", () => {
        expect(completedCombos(new Set(["KeyW", "KeyA", "KeyS", "KeyD"]), [])).toEqual(["wasd"]);
        expect(completedCombos(new Set(["KeyW", "KeyA", "KeyS", "KeyD"]), ["wasd"])).toEqual([]);
    });
});
