import { describe, expect, test } from "bun:test";

import { DEFAULT_KEY_FAULT_WINDOW_MS } from "@/modules/keyboard-tester/domain/constants";
import {
    applyKeyInput,
    createKeySession,
    heldCodes,
    readRepeat,
} from "@/modules/keyboard-tester/domain/session";
import type { KeyInput, KeySession } from "@/modules/keyboard-tester/types";

const SETTINGS = { faultWindowMs: DEFAULT_KEY_FAULT_WINDOW_MS };

function run(inputs: readonly KeyInput[], start: KeySession = createKeySession()): KeySession {
    return inputs.reduce((session, input) => applyKeyInput(session, input, SETTINGS), start);
}

const down = (code: string, time: number, repeat = false): KeyInput => ({
    type: "down",
    code,
    time,
    repeat,
});
const up = (code: string, time: number): KeyInput => ({ type: "up", code, time });
const tap = (code: string, at: number, hold = 70) => [down(code, at), up(code, at + hold)];

describe("presses", () => {
    test("counts by physical code and times press to press", () => {
        const session = run([...tap("KeyA", 1000), ...tap("KeyA", 1300), ...tap("KeyB", 1400)]);

        expect(session.keys.KeyA.presses).toBe(2);
        expect(session.keys.KeyA.lastInterval).toBe(300);
        expect(session.history.map((entry) => entry.code)).toEqual(["KeyB", "KeyA", "KeyA"]);
        expect(session.history[0].at).toBe(400);
    });

    test("flags a doubled keystroke as chatter", () => {
        const session = run([...tap("KeyE", 0, 8), ...tap("KeyE", 22, 50)]);

        expect(session.keys.KeyE.chatter).toBe(1);
        expect(session.chatter).toEqual([{ code: "KeyE", at: 22, interval: 22 }]);
        expect(session.history[0].chatter).toBe(true);
    });

    test("leaves fast human typing alone", () => {
        const session = run([...tap("KeyL", 0, 40), ...tap("KeyL", 110, 40)]);

        expect(session.keys.KeyL.chatter).toBe(0);
    });

    test("does not count auto-repeat as presses", () => {
        const session = run([
            down("KeyK", 0),
            down("KeyK", 500, true),
            down("KeyK", 533, true),
            up("KeyK", 600),
        ]);

        expect(session.keys.KeyK.presses).toBe(1);
        expect(session.keys.KeyK.chatter).toBe(0);
    });

    test("counts a release-only key once, as Windows sends Print Screen", () => {
        const session = run([up("PrintScreen", 100), up("PrintScreen", 900)]);

        expect(session.keys.PrintScreen.presses).toBe(1);
        expect(session.keys.PrintScreen.held).toBe(false);
    });
});

describe("rollover", () => {
    test("records the most keys held at once, modifiers apart", () => {
        const session = run([
            down("ShiftLeft", 0),
            down("KeyW", 10),
            down("KeyA", 20),
            down("Space", 30),
            up("KeyW", 40),
            down("KeyD", 50),
        ]);

        expect(session.peakHeld).toEqual({ total: 4, modifiers: 1, others: 3 });
        expect([...heldCodes(session)].sort()).toEqual(["KeyA", "KeyD", "ShiftLeft", "Space"]);
    });

    test("marks a chord passed once all of it was down together", () => {
        const session = run([
            down("ShiftLeft", 0),
            down("KeyW", 10),
            down("KeyA", 20),
            down("Space", 30),
        ]);

        expect(session.combos).toEqual(["runJump"]);
    });

    test("releases everything when the platform drops the releases", () => {
        const session = run([
            down("MetaLeft", 0),
            down("KeyC", 10),
            { type: "releaseAll", time: 50 },
        ]);

        expect(heldCodes(session).size).toBe(0);
        // The late keyup of a key still down must not count as a new press.
        expect(run([up("KeyC", 80)], session).keys.KeyC.presses).toBe(1);
    });
});

describe("auto-repeat", () => {
    test("reads the delay and the rate", () => {
        expect(readRepeat(0, [500, 533, 566, 600])).toEqual({ delayMs: 500, perSecond: 30 });
    });

    test("waits for enough repeats", () => {
        expect(readRepeat(0, [500, 533])).toBeNull();
    });

    test("follows the key being held, through the reducer", () => {
        const repeats = [500, 533, 566, 600].map((time) => down("KeyJ", time, true));
        const session = run([down("KeyJ", 0), ...repeats]);

        expect(session.repeat).toEqual({ delayMs: 500, perSecond: 30 });
    });
});
