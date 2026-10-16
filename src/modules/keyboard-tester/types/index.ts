/** Physical sizes, by how much of a full board is left. */
export const KEYBOARD_SIZES = ["full", "tkl", "75", "65", "60"] as const;

export type KeyboardSize = (typeof KEYBOARD_SIZES)[number];

/**
 * ANSI has a wide one-row Enter and a long left Shift; ISO has an L-shaped
 * Enter, a short left Shift and one extra key beside it (`IntlBackslash`).
 */
export const KEYBOARD_STANDARDS = ["ansi", "iso"] as const;

export type KeyboardStandard = (typeof KEYBOARD_STANDARDS)[number];

/** Which names the modifiers get. Positions are the same; only the caps differ. */
export const KEY_LABEL_SYSTEMS = ["windows", "mac"] as const;

export type KeyLabelSystem = (typeof KEY_LABEL_SYSTEMS)[number];

/**
 * A key on the drawing, in key units: `1` is one standard keycap. `code` is
 * `KeyboardEvent.code` — the physical position, whatever the layout prints on
 * it — or `null` for a key no computer ever hears about (Fn).
 */
export type LayoutKey = {
    readonly code: string | null;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    /**
     * The ISO Enter is the one key that is not a rectangle: it fills its
     * bounding box less the bottom-left notch the backslash key sits in.
     */
    readonly shape?: "isoEnter";
};

export type KeyboardLayout = {
    readonly keys: readonly LayoutKey[];
    readonly width: number;
    readonly height: number;
    /** The distinct codes the drawing can test, in drawing order. */
    readonly codes: readonly string[];
    /**
     * The empty corner above the number pad, where a full-size board keeps its
     * lock lights and its maker's name. `null` on boards that have no such gap.
     */
    readonly indicatorArea: {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
    } | null;
};

/** The three lock lights, as the operating system reports them. */
export const LOCK_KEYS = ["NumLock", "CapsLock", "ScrollLock"] as const;

export type LockKey = (typeof LOCK_KEYS)[number];

/** `null` until a key event has said; the browser offers no way to ask sooner. */
export type LockStates = Readonly<Record<LockKey, boolean>> | null;

/** Something the reader did, as the reducer receives it. `time` is in milliseconds. */
export type KeyInput =
    | {
          readonly type: "down";
          readonly code: string;
          readonly time: number;
          /** The operating system's auto-repeat, not a new press. */
          readonly repeat: boolean;
      }
    | { readonly type: "up"; readonly code: string; readonly time: number }
    /**
     * Every held key let go without a release: the area lost focus, or macOS
     * swallowed the releases (it sends no `keyup` for keys pressed while
     * Command is down).
     */
    | { readonly type: "releaseAll"; readonly time: number };

export type KeyStats = {
    readonly presses: number;
    readonly chatter: number;
    readonly held: boolean;
    readonly lastDown: number | null;
    /** Press to press, for the most recent press after the first. */
    readonly lastInterval: number | null;
};

export type KeyHistoryEntry = {
    readonly id: number;
    readonly code: string;
    /** Milliseconds since the session's first key. */
    readonly at: number;
    /** Press to press for the same key, where there was an earlier press. */
    readonly interval: number | null;
    readonly chatter: boolean;
};

export type KeyChatterRecord = {
    readonly code: string;
    readonly at: number;
    readonly interval: number;
};

/** What holding a key down makes the operating system send. */
export type RepeatReading = {
    /** From the press to the first repeat. */
    readonly delayMs: number;
    readonly perSecond: number;
};

export type KeySession = {
    readonly startedAt: number | null;
    readonly keys: Readonly<Record<string, KeyStats>>;
    /** Newest first. */
    readonly history: readonly KeyHistoryEntry[];
    /** Oldest first, for the report. */
    readonly chatter: readonly KeyChatterRecord[];
    readonly nextId: number;
    /** Most keys down at once, modifiers and the rest counted apart. */
    readonly peakHeld: {
        readonly total: number;
        readonly modifiers: number;
        readonly others: number;
    };
    /** Combo ids that have been held all at once. */
    readonly combos: readonly string[];
    /** The key being held for a repeat reading, and the repeats it has sent. */
    readonly repeatProbe: {
        readonly code: string;
        readonly down: number;
        readonly repeats: readonly number[];
    } | null;
    readonly repeat: RepeatReading | null;
};

export type KeySettings = {
    /** Below this, press to press, a second press of one key is chatter. */
    readonly faultWindowMs: number;
};

/** Named so the article and the reader can say "my layout reads as QWERTZ". */
export const LAYOUT_FAMILIES = [
    "qwerty",
    "qwertz",
    "azerty",
    "dvorak",
    "colemak",
    "other",
] as const;

export type LayoutFamily = (typeof LAYOUT_FAMILIES)[number];
