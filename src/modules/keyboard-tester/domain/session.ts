import { completedCombos } from "./combos";
import {
    MAX_KEY_CHATTER_RECORDS,
    MAX_KEY_HISTORY,
    MIN_REPEATS_FOR_READING,
    MODIFIER_CODES,
} from "./constants";
import type { KeyInput, KeySession, KeySettings, KeyStats, RepeatReading } from "../types";

/**
 * A keyboard test as a reducer over key events, pure and clock-free like the
 * mouse tester's: every input carries its own timestamp.
 *
 * Keys are tracked by `KeyboardEvent.code`, the physical position, so the test
 * means the same whatever layout the reader types in.
 */

const IDLE_KEY: KeyStats = {
    presses: 0,
    chatter: 0,
    held: false,
    lastDown: null,
    lastInterval: null,
};

export function createKeySession(): KeySession {
    return {
        startedAt: null,
        keys: {},
        history: [],
        chatter: [],
        nextId: 0,
        peakHeld: { total: 0, modifiers: 0, others: 0 },
        combos: [],
        repeatProbe: null,
        repeat: null,
    };
}

export function heldCodes(session: KeySession): Set<string> {
    return new Set(Object.keys(session.keys).filter((code) => session.keys[code].held));
}

export function applyKeyInput(
    session: KeySession,
    input: KeyInput,
    settings: KeySettings,
): KeySession {
    switch (input.type) {
        case "down":
            return input.repeat
                ? repeat(session, input.code, input.time)
                : press(session, input.code, input.time, settings);
        case "up":
            return release(session, input.code, input.time, settings);
        case "releaseAll":
            return releaseAll(session);
    }
}

function press(
    session: KeySession,
    code: string,
    time: number,
    { faultWindowMs }: KeySettings,
): KeySession {
    const startedAt = session.startedAt ?? time;
    const stats = session.keys[code] ?? IDLE_KEY;

    // A press for a key already down is a release the browser never sent —
    // treat it as the same press, not a new one.
    if (stats.held) {
        return session;
    }

    const interval = stats.lastDown === null ? null : time - stats.lastDown;
    const chatter = interval !== null && interval < faultWindowMs;
    const keys = {
        ...session.keys,
        [code]: {
            presses: stats.presses + 1,
            chatter: stats.chatter + (chatter ? 1 : 0),
            held: true,
            lastDown: time,
            lastInterval: interval,
        },
    };
    const held = new Set(Object.keys(keys).filter((key) => keys[key].held));
    const modifiers = [...held].filter((key) => MODIFIER_CODES.has(key)).length;
    const total = held.size;

    return {
        ...session,
        startedAt,
        keys,
        history: [
            { id: session.nextId, code, at: time - startedAt, interval, chatter },
            ...session.history,
        ].slice(0, MAX_KEY_HISTORY),
        chatter:
            chatter && interval !== null && session.chatter.length < MAX_KEY_CHATTER_RECORDS
                ? [...session.chatter, { code, at: time - startedAt, interval }]
                : session.chatter,
        nextId: session.nextId + 1,
        peakHeld:
            total > session.peakHeld.total
                ? { total, modifiers, others: total - modifiers }
                : session.peakHeld,
        combos: [...session.combos, ...completedCombos(held, session.combos)],
        // A new press starts a new repeat probe; whatever was being held for
        // one has stopped repeating the moment another key went down.
        repeatProbe: { code, down: time, repeats: [] },
    };
}

/**
 * Auto-repeat says what the operating system's repeat settings are, which is
 * worth knowing when a held key "types too fast" — and it is the only reading
 * here that is about the computer rather than the keyboard.
 */
function repeat(session: KeySession, code: string, time: number): KeySession {
    const probe = session.repeatProbe;

    if (probe === null || probe.code !== code) {
        return session;
    }

    const repeats = [...probe.repeats, time];

    return {
        ...session,
        repeatProbe: { ...probe, repeats },
        repeat: readRepeat(probe.down, repeats) ?? session.repeat,
    };
}

export function readRepeat(down: number, repeats: readonly number[]): RepeatReading | null {
    if (repeats.length < MIN_REPEATS_FOR_READING) {
        return null;
    }

    const span = repeats[repeats.length - 1] - repeats[0];

    return {
        delayMs: repeats[0] - down,
        perSecond: ((repeats.length - 1) * 1000) / span,
    };
}

function release(
    session: KeySession,
    code: string,
    time: number,
    settings: KeySettings,
): KeySession {
    const stats = session.keys[code];

    // A release with no press: Windows sends only `keyup` for Print Screen,
    // because the system takes the press. The key still works, so the first
    // such release counts as a press and a release at once. Only the first:
    // after a forced release-all, a key still physically down sends its
    // `keyup` later, and that must not count as a second press.
    if (stats === undefined) {
        const pressed = press(session, code, time, settings);

        return {
            ...pressed,
            keys: { ...pressed.keys, [code]: { ...pressed.keys[code], held: false } },
            repeatProbe: null,
        };
    }

    if (!stats.held) {
        return session;
    }

    return {
        ...session,
        keys: { ...session.keys, [code]: { ...stats, held: false } },
        repeatProbe: session.repeatProbe?.code === code ? null : session.repeatProbe,
    };
}

function releaseAll(session: KeySession): KeySession {
    const keys: Record<string, KeyStats> = {};

    for (const [code, stats] of Object.entries(session.keys)) {
        keys[code] = stats.held ? { ...stats, held: false } : stats;
    }

    return { ...session, keys, repeatProbe: null };
}
