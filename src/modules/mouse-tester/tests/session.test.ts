import { describe, expect, test } from "bun:test";

import {
    BOUNCE_GAP_MS,
    DEFAULT_FAULT_WINDOW_MS,
    MAX_LOG_ENTRIES,
} from "@/modules/mouse-tester/domain/constants";
import { applyInput, classifyPress, createSession } from "@/modules/mouse-tester/domain/session";
import type { MouseInput, MouseSession } from "@/modules/mouse-tester/types";

const SETTINGS = { faultWindowMs: DEFAULT_FAULT_WINDOW_MS };

function run(inputs: readonly MouseInput[], start: MouseSession = createSession()): MouseSession {
    return inputs.reduce((session, input) => applyInput(session, input, SETTINGS), start);
}

/** A click: pressed at `at`, released `hold` ms later. */
function click(at: number, hold = 90, button: "left" | "right" = "left"): MouseInput[] {
    return [
        { type: "press", button, time: at },
        { type: "release", button, time: at + hold },
    ];
}

describe("buttons", () => {
    test("counts presses per button and times press to press", () => {
        const session = run([...click(1000), ...click(1400), ...click(1600, 80, "right")]);

        expect(session.buttons.left.presses).toBe(2);
        expect(session.buttons.right.presses).toBe(1);
        expect(session.buttons.left.lastInterval).toBe(400);
        expect(session.buttons.left.chatter).toBe(0);
        expect(session.faults).toEqual([]);
    });

    test("counts the log from the first event", () => {
        const session = run([...click(5000), ...click(5300)]);

        expect(session.startedAt).toBe(5000);
        expect(session.log.map((entry) => entry.at)).toEqual([300, 0]);
    });

    test("flags a second press inside the window as chatter", () => {
        const session = run([...click(1000, 8), ...click(1030, 60)]);

        expect(session.buttons.left.chatter).toBe(1);
        expect(session.log[0]).toMatchObject({ kind: "press", fault: "chatter", interval: 30 });
        expect(session.faults).toEqual([{ kind: "chatter", control: "left", at: 30, gap: 30 }]);
    });

    test("flags a bounce on the way up, however long the click was held", () => {
        // An ordinary 120 ms click that bounces 4 ms after release: the press
        // to press time is well outside the window, the gap is not.
        const session = run([...click(1000, 120), ...click(1124, 30)]);

        expect(session.buttons.left.chatter).toBe(1);
        expect(session.faults[0]).toEqual({ kind: "chatter", control: "left", at: 124, gap: 4 });
    });

    test("leaves a fast but human double click alone", () => {
        // Release to press of 60 ms, press to press of 140 ms.
        const session = run([...click(1000, 80), ...click(1140, 80)]);

        expect(session.buttons.left.chatter).toBe(0);
        expect(session.buttons.left.drops).toBe(0);
    });

    test("calls a broken hold a drop, not chatter", () => {
        const session = run([
            { type: "press", button: "left", time: 1000 },
            { type: "release", button: "left", time: 2500 },
            { type: "press", button: "left", time: 2506 },
            { type: "release", button: "left", time: 4000 },
        ]);

        expect(session.buttons.left.drops).toBe(1);
        expect(session.buttons.left.chatter).toBe(0);
        expect(session.faults).toEqual([{ kind: "drop", control: "left", at: 1506, gap: 6 }]);
        expect(session.buttons.left.longestHold).toBe(1500);
    });

    test("ignores a release whose press it never saw", () => {
        const session = run([{ type: "release", button: "back", time: 10 }]);

        expect(session.buttons.back).toEqual(createSession().buttons.back);
        expect(session.log).toEqual([]);
    });

    test("logs a release only when the hold was long enough to read", () => {
        const session = run([...click(0, 90), ...click(1000, 900)]);

        expect(session.log.map((entry) => entry.kind)).toEqual(["release", "press", "press"]);
        expect(session.log[0]).toMatchObject({ kind: "release", hold: 900 });
    });

    test("remembers the latest hold attempt, not the best one, and ignores clicks", () => {
        const session = run([...click(0, 3200), ...click(4000, 1400), ...click(6000, 90)]);

        expect(session.lastHoldAttempt).toBe(1400);
        expect(session.buttons.left.longestHold).toBe(3200);
    });

    test("a lost focus does not turn the next press into a bounce", () => {
        const session = run([
            { type: "press", button: "left", time: 1000 },
            { type: "cancel", time: 1500 },
            { type: "press", button: "left", time: 1502 },
        ]);

        expect(session.buttons.left.held).toBe(true);
        expect(session.buttons.left.drops + session.buttons.left.chatter).toBe(0);
    });

    test("measures peak clicks per second, without the bounces", () => {
        const presses = Array.from({ length: 8 }, (_, index) => click(index * 110, 40)).flat();
        const session = run([...presses, ...click(880, 3), ...click(885, 3)]);

        expect(session.peakCps).toBe(9);
    });

    test("keeps the log bounded, newest first", () => {
        const presses = Array.from({ length: MAX_LOG_ENTRIES + 10 }, (_, index) =>
            click(index * 300),
        ).flat();
        const session = run(presses);

        expect(session.log).toHaveLength(MAX_LOG_ENTRIES);
        expect(session.log[0].at).toBe((MAX_LOG_ENTRIES + 9) * 300);
    });
});

describe("keys", () => {
    test("logs a keystroke by its code, apart from the buttons", () => {
        const session = run([...click(0), { type: "key", code: "F13", time: 500 }]);

        expect(session.keystrokes).toBe(1);
        expect(session.log[0]).toMatchObject({ kind: "key", code: "F13", at: 500 });
        expect(session.buttons.left.presses).toBe(1);
    });
});

describe("classifyPress", () => {
    test("treats the bounce gap as mechanical at any window", () => {
        const stats = {
            ...createSession().buttons.left,
            presses: 1,
            lastDown: 0,
            lastUp: 100,
        };

        expect(classifyPress(stats, 100 + BOUNCE_GAP_MS - 1, { faultWindowMs: 20 }).fault).toBe(
            "chatter",
        );
        expect(classifyPress(stats, 100 + BOUNCE_GAP_MS, { faultWindowMs: 20 }).fault).toBeNull();
    });

    test("follows the window the reader set", () => {
        const stats = { ...createSession().buttons.left, presses: 1, lastDown: 0, lastUp: 30 };

        expect(classifyPress(stats, 70, { faultWindowMs: 80 }).fault).toBe("chatter");
        expect(classifyPress(stats, 70, { faultWindowMs: 50 }).fault).toBeNull();
    });
});

describe("wheel", () => {
    function notches(
        directions: readonly ("up" | "down" | "left" | "right")[],
        spacing = 40,
    ): MouseInput[] {
        return directions.map((direction, index) => ({
            type: "wheel",
            direction,
            time: 1000 + index * spacing,
        }));
    }

    test("counts each direction", () => {
        const session = run(notches(["down", "down", "up", "left", "right", "right"], 400));

        expect(session.wheel.counts).toEqual({ up: 1, down: 2, left: 1, right: 2 });
        expect(session.wheel.reversals).toBe(0);
    });

    test("finds one wrong-way notch inside a steady scroll", () => {
        const session = run(notches(["down", "down", "up", "down", "down"]));

        expect(session.wheel.reversals).toBe(1);
        expect(session.faults).toEqual([{ kind: "reversal", control: "wheel", at: 80, gap: 40 }]);
        // The notch is marked in the log once the one after it has arrived.
        expect(session.log.find((entry) => entry.at === 80)?.fault).toBe("reversal");
    });

    test("does not call a deliberate change of direction a reversal", () => {
        expect(run(notches(["down", "down", "up", "up", "up"])).wheel.reversals).toBe(0);
        expect(run(notches(["down", "up", "down"], 400)).wheel.reversals).toBe(0);
    });

    test("keeps the axes apart", () => {
        // A tilt between two downward notches is not a reversal of either.
        expect(run(notches(["down", "left", "down"])).wheel.reversals).toBe(0);
    });
});
