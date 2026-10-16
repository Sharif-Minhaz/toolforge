import {
    BOUNCE_GAP_MS,
    HOLD_DROP_MIN_MS,
    HOLD_ATTEMPT_MIN_MS,
    MAX_FAULT_RECORDS,
    MAX_LOG_ENTRIES,
    REVERSAL_WINDOW_MS,
} from "./constants";
import {
    MOUSE_BUTTONS,
    type ButtonStats,
    type FaultKind,
    type FaultRecord,
    type LogEntry,
    type MouseButton,
    type MouseInput,
    type MouseSession,
    type MouseSettings,
    type WheelAxis,
    type WheelDirection,
    type WheelNotch,
} from "../types";

/**
 * A test session as a reducer over what the reader did.
 *
 * Pure and clock-free: every input carries its own timestamp, which in the
 * browser is the event's `timeStamp`. That is the whole reason this can be
 * tested — a bounce two milliseconds wide is a pair of numbers here, not a
 * finger that has to be fast enough.
 */

const IDLE_BUTTON: ButtonStats = {
    presses: 0,
    chatter: 0,
    drops: 0,
    held: false,
    lastDown: null,
    lastUp: null,
    lastInterval: null,
    longestHold: 0,
};

export function createSession(): MouseSession {
    return {
        startedAt: null,
        buttons: {
            left: IDLE_BUTTON,
            middle: IDLE_BUTTON,
            right: IDLE_BUTTON,
            back: IDLE_BUTTON,
            forward: IDLE_BUTTON,
        },
        wheel: {
            counts: { up: 0, down: 0, left: 0, right: 0 },
            reversals: 0,
            recent: { vertical: [], horizontal: [] },
        },
        log: [],
        faults: [],
        nextId: 0,
        recentPresses: [],
        peakCps: 0,
        lastHoldAttempt: null,
        keystrokes: 0,
    };
}

/**
 * What a press means, given what the same button did last.
 *
 * Checked in this order because a drop and a bounce look alike — both are a
 * release followed almost at once by a press — and only the hold before them
 * tells them apart. A person holding a button for a fifth of a second and then
 * clicking it again inside fifty milliseconds is not a thing people do.
 */
export function classifyPress(
    stats: ButtonStats,
    time: number,
    { faultWindowMs }: MouseSettings,
): { readonly fault: FaultKind | null; readonly gap: number | null } {
    const interval = stats.lastDown === null ? null : time - stats.lastDown;
    const releaseGap =
        stats.lastUp === null || stats.held || stats.lastDown === null ? null : time - stats.lastUp;
    const heldFor =
        releaseGap === null || stats.lastUp === null || stats.lastDown === null
            ? null
            : stats.lastUp - stats.lastDown;

    if (
        releaseGap !== null &&
        heldFor !== null &&
        heldFor >= HOLD_DROP_MIN_MS &&
        releaseGap < faultWindowMs
    ) {
        return { fault: "drop", gap: releaseGap };
    }

    if (interval !== null && interval < faultWindowMs) {
        return { fault: "chatter", gap: interval };
    }

    if (releaseGap !== null && releaseGap < BOUNCE_GAP_MS) {
        return { fault: "chatter", gap: releaseGap };
    }

    return { fault: null, gap: null };
}

export function applyInput(
    session: MouseSession,
    input: MouseInput,
    settings: MouseSettings,
): MouseSession {
    const started = session.startedAt === null ? { ...session, startedAt: input.time } : session;

    switch (input.type) {
        case "press":
            return press(started, input.button, input.time, settings);
        case "release":
            return release(started, input.button, input.time);
        case "wheel":
            return wheel(started, input.direction, input.time);
        case "cancel":
            return cancel(started);
        case "key":
            return key(started, input.code, input.time);
    }
}

function press(
    session: MouseSession,
    button: MouseButton,
    time: number,
    settings: MouseSettings,
): MouseSession {
    const stats = session.buttons[button];
    const { fault, gap } = classifyPress(stats, time, settings);
    const at = time - (session.startedAt ?? time);
    const interval = stats.lastDown === null ? null : time - stats.lastDown;

    // A faulted press is the switch, not the hand, so it does not count
    // towards how fast the hand is.
    const recentPresses =
        fault === null
            ? [...session.recentPresses.filter((past) => time - past < 1000), time]
            : session.recentPresses;

    const entry: LogEntry = {
        id: session.nextId,
        kind: "press",
        control: button,
        at,
        interval,
        fault,
    };

    return {
        ...session,
        buttons: {
            ...session.buttons,
            [button]: {
                ...stats,
                presses: stats.presses + 1,
                chatter: stats.chatter + (fault === "chatter" ? 1 : 0),
                drops: stats.drops + (fault === "drop" ? 1 : 0),
                held: true,
                lastDown: time,
                lastInterval: interval,
            },
        },
        log: prepend(session.log, entry),
        faults:
            fault === null || gap === null
                ? session.faults
                : appendFault(session.faults, { kind: fault, control: button, at, gap }),
        nextId: session.nextId + 1,
        recentPresses,
        peakCps: Math.max(session.peakCps, recentPresses.length),
    };
}

function release(session: MouseSession, button: MouseButton, time: number): MouseSession {
    const stats = session.buttons[button];

    // A release for a press this session never saw — pressed outside the test
    // area, or before the page loaded — says nothing about the switch.
    if (!stats.held || stats.lastDown === null) {
        return session;
    }

    const hold = time - stats.lastDown;
    const attempt = hold >= HOLD_ATTEMPT_MIN_MS;

    return {
        ...session,
        buttons: {
            ...session.buttons,
            [button]: {
                ...stats,
                held: false,
                lastUp: time,
                longestHold: Math.max(stats.longestHold, hold),
            },
        },
        log: attempt
            ? prepend(session.log, {
                  id: session.nextId,
                  kind: "release",
                  control: button,
                  at: time - (session.startedAt ?? time),
                  hold,
                  fault: null,
              })
            : session.log,
        nextId: attempt ? session.nextId + 1 : session.nextId,
        lastHoldAttempt: attempt ? hold : session.lastHoldAttempt,
    };
}

/**
 * Lets go of every held button without recording a release. The next press
 * then has no release to measure a gap against, so coming back to the window
 * cannot be mistaken for a bounce.
 */
function cancel(session: MouseSession): MouseSession {
    const buttons = { ...session.buttons };

    for (const button of MOUSE_BUTTONS) {
        if (buttons[button].held) {
            buttons[button] = { ...buttons[button], held: false, lastUp: null };
        }
    }

    return { ...session, buttons };
}

function key(session: MouseSession, code: string, time: number): MouseSession {
    return {
        ...session,
        log: prepend(session.log, {
            id: session.nextId,
            kind: "key",
            code,
            at: time - (session.startedAt ?? time),
            fault: null,
        }),
        nextId: session.nextId + 1,
        keystrokes: session.keystrokes + 1,
    };
}

export function axisOf(direction: WheelDirection): WheelAxis {
    return direction === "up" || direction === "down" ? "vertical" : "horizontal";
}

/**
 * A wrong-way notch can only be recognised once the notch after it has
 * arrived, so it is the *middle* of the last three that is judged: it has to
 * disagree with both neighbours while they agree with each other, and arrive
 * close enough to both that nobody turned the wheel back on purpose.
 */
export function isReversal(
    before: WheelNotch,
    middle: WheelNotch,
    after: { readonly direction: WheelDirection; readonly time: number },
): boolean {
    return (
        before.direction === after.direction &&
        middle.direction !== before.direction &&
        middle.time - before.time < REVERSAL_WINDOW_MS &&
        after.time - middle.time < REVERSAL_WINDOW_MS
    );
}

function wheel(session: MouseSession, direction: WheelDirection, time: number): MouseSession {
    const axis = axisOf(direction);
    const [before, middle] = session.wheel.recent[axis];
    const reversed =
        before !== undefined &&
        middle !== undefined &&
        isReversal(before, middle, { direction, time });

    const notch: WheelNotch = { direction, time, logId: session.nextId };
    const entry: LogEntry = {
        id: session.nextId,
        kind: "wheel",
        control: direction,
        at: time - (session.startedAt ?? time),
        fault: null,
    };

    const recentForAxis = [...session.wheel.recent[axis], notch].slice(-2);
    const log = prepend(
        reversed ? markLogged(session.log, middle.logId, "reversal") : session.log,
        entry,
    );

    return {
        ...session,
        wheel: {
            counts: {
                ...session.wheel.counts,
                [direction]: session.wheel.counts[direction] + 1,
            },
            reversals: session.wheel.reversals + (reversed ? 1 : 0),
            recent: { ...session.wheel.recent, [axis]: recentForAxis },
        },
        log,
        faults: reversed
            ? appendFault(session.faults, {
                  kind: "reversal",
                  control: "wheel",
                  at: middle.time - (session.startedAt ?? middle.time),
                  gap: middle.time - before.time,
              })
            : session.faults,
        nextId: session.nextId + 1,
    };
}

function prepend(log: readonly LogEntry[], entry: LogEntry): readonly LogEntry[] {
    return [entry, ...log].slice(0, MAX_LOG_ENTRIES);
}

function appendFault(faults: readonly FaultRecord[], fault: FaultRecord): readonly FaultRecord[] {
    return faults.length >= MAX_FAULT_RECORDS ? faults : [...faults, fault];
}

/** A notch scrolled out of the log stays unmarked; its count is still right. */
function markLogged(log: readonly LogEntry[], id: number, fault: FaultKind): readonly LogEntry[] {
    return log.map((entry) => (entry.id === id ? { ...entry, fault } : entry));
}
