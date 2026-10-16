import { describe, expect, test } from "bun:test";

import {
    nextLockStates,
    reportedLockStates,
    type LockEvent,
} from "@/modules/keyboard-tester/domain/locks";
import type { LockStates } from "@/modules/keyboard-tester/types";

const OFF = { NumLock: false, CapsLock: false, ScrollLock: false };
const CAPS = { ...OFF, CapsLock: true };

function event(
    type: "down" | "up",
    code: string,
    reported: LockEvent["reported"],
    repeat = false,
): LockEvent {
    return { type, code, repeat, reported };
}

function run(
    events: readonly LockEvent[],
    platform: "mac" | "linux" | "other",
    start: LockStates = OFF,
) {
    return events.reduce<LockStates>(
        (current, next) => nextLockStates(current, next, platform),
        start,
    );
}

describe("nextLockStates", () => {
    test("turns Caps Lock off on Linux, which reports the old state on both events", () => {
        // On: the press reports the old "off", the release the new "on".
        const on = run([event("down", "CapsLock", OFF), event("up", "CapsLock", CAPS)], "linux");

        expect(on?.CapsLock).toBe(true);

        // Off: both events still report "on".
        const off = run(
            [event("down", "CapsLock", CAPS), event("up", "CapsLock", CAPS)],
            "other",
            on,
        );

        expect(off?.CapsLock).toBe(false);
    });

    test("agrees with Windows, which reports the new state", () => {
        const on = run([event("down", "CapsLock", CAPS), event("up", "CapsLock", CAPS)], "other");
        const off = run(
            [event("down", "CapsLock", OFF), event("up", "CapsLock", OFF)],
            "other",
            on,
        );

        expect(on?.CapsLock).toBe(true);
        expect(off?.CapsLock).toBe(false);
    });

    test("follows macOS, which sends a press to turn on and a release to turn off", () => {
        const on = run([event("down", "CapsLock", CAPS)], "mac");
        const off = run([event("up", "CapsLock", OFF)], "mac", on);

        expect(on?.CapsLock).toBe(true);
        expect(off?.CapsLock).toBe(false);
    });

    test("lets any other key correct a light that drifted", () => {
        const drifted = { ...OFF, CapsLock: true };

        expect(run([event("down", "KeyA", OFF)], "other", drifted)?.CapsLock).toBe(false);
    });

    test("ignores auto-repeat of a held lock key", () => {
        const held = run(
            [event("down", "NumLock", OFF), event("down", "NumLock", OFF, true)],
            "other",
        );

        expect(held?.NumLock).toBe(true);
    });

    test("reads the report when nothing is known yet", () => {
        expect(nextLockStates(null, event("down", "CapsLock", CAPS), "other")?.CapsLock).toBe(true);
    });

    test("lights on the very first press on Linux, whose report is the old state", () => {
        const first = run(
            [event("down", "CapsLock", OFF), event("up", "CapsLock", CAPS)],
            "linux",
            null,
        );

        expect(first?.CapsLock).toBe(true);
    });

    test("takes a click's report as the truth before any key", () => {
        expect(reportedLockStates(null, CAPS)).toEqual(CAPS);

        const current = { ...CAPS };

        expect(reportedLockStates(current, CAPS)).toBe(current);
    });

    test("keeps the same object when nothing changed, so nothing re-renders", () => {
        const current = { ...OFF };

        expect(nextLockStates(current, event("down", "KeyA", OFF), "other")).toBe(current);
    });
});
