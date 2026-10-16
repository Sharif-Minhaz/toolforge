import { LOCK_KEYS, type LockKey, type LockStates } from "../types";

/**
 * The lock lights, worked out from key events — the only place a browser
 * reports them, and not always truthfully about the key that just changed one.
 *
 * `getModifierState()` is right about every lock *except* the one whose own
 * key fired the event, and how it is wrong depends on the platform:
 *
 * - Windows reports the state after the toggle, on press and release alike.
 * - Linux reports the state before the event, so turning Caps Lock off reads
 *   "on" on both the press and the release — the light would never go out.
 * - macOS sends one event per toggle for Caps Lock: `keydown` when it turns
 *   on, `keyup` when it turns off, never a pair.
 *
 * So the lock key's own events are believed for nothing but the fact that the
 * key was pressed: a press flips the light we already have. Every other key's
 * event carries the truth and corrects any drift.
 */

export type LockEvent = {
    readonly type: "down" | "up";
    readonly code: string;
    readonly repeat: boolean;
    readonly reported: Readonly<Record<LockKey, boolean>>;
};

export type LockPlatform = "mac" | "linux" | "other";

function isLockKey(code: string): code is LockKey {
    return (LOCK_KEYS as readonly string[]).includes(code);
}

export function nextLockStates(
    current: LockStates,
    event: LockEvent,
    platform: LockPlatform,
): LockStates {
    const next: Record<LockKey, boolean> = { ...event.reported };

    if (isLockKey(event.code)) {
        const lock = event.code;
        const known = current?.[lock];

        if (platform === "mac" && lock === "CapsLock") {
            next[lock] = event.type === "down";
        } else if (event.type === "down" && !event.repeat) {
            // Unknown before the first event, the report is all there is —
            // and on Linux it is the state before this press, so the press
            // means the opposite of it.
            next[lock] =
                known !== undefined
                    ? !known
                    : platform === "linux"
                      ? !event.reported[lock]
                      : event.reported[lock];
        } else {
            next[lock] = known ?? event.reported[lock];
        }
    }

    return keepIfSame(current, next);
}

/**
 * A report from an event that is not a lock key's own — a mouse click on the
 * board, say, which carries `getModifierState` too and is truthful about all
 * three. It is what lets the lights be right before the first key is pressed.
 */
export function reportedLockStates(
    current: LockStates,
    reported: Readonly<Record<LockKey, boolean>>,
): LockStates {
    return keepIfSame(current, { ...reported });
}

function keepIfSame(current: LockStates, next: Record<LockKey, boolean>): LockStates {
    const unchanged = current !== null && LOCK_KEYS.every((key) => current[key] === next[key]);

    return unchanged ? current : next;
}
