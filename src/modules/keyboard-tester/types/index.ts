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

/** Named so the reader can say "my layout reads as QWERTZ". */
export const LAYOUT_FAMILIES = [
    "qwerty",
    "qwertz",
    "azerty",
    "dvorak",
    "colemak",
    "other",
] as const;

export type LayoutFamily = (typeof LAYOUT_FAMILIES)[number];

/**
 * The two things this page does with a keyboard: test every key on it, or
 * time how fast the reader types on it. One page, because the second is the
 * question people ask straight after the first.
 */
export const KEYBOARD_TESTER_MODES = ["keys", "typing"] as const;

export type KeyboardTesterMode = (typeof KEYBOARD_TESTER_MODES)[number];

/** How long a typing run lasts, in seconds. */
export const TYPING_DURATIONS = [15, 30, 60, 120] as const;

export type TypingDuration = (typeof TYPING_DURATIONS)[number];

/** Which word list the run draws from. */
export const TYPING_LANGUAGES = ["english", "bangla"] as const;

export type TypingLanguage = (typeof TYPING_LANGUAGES)[number];

/**
 * One finished word, compared code point by code point against its target.
 * `missed` is what was skipped by pressing space early; `extra` is what ran
 * past the target's end.
 */
export type WordScore = {
    readonly correct: number;
    readonly incorrect: number;
    readonly extra: number;
    readonly missed: number;
    /** Every code point typed matches, and nothing is missing. */
    readonly exact: boolean;
};

/** Running totals after one input event, for the speed-over-time chart. */
export type TypingSnapshot = {
    /** Milliseconds since the first keystroke. */
    readonly at: number;
    /** Characters that count towards net speed: correct words and their spaces. */
    readonly netChars: number;
    /** Every character typed, right or wrong, spaces included. */
    readonly rawChars: number;
};

export type TypingRun = {
    /** The target, already NFC-normalised. */
    readonly words: readonly string[];
    /** Committed words, one per target word, in order. */
    readonly typed: readonly string[];
    /** The word under the caret, not yet committed with a space. */
    readonly current: string;
    /** `performance.now()` at the first keystroke; `null` before it. */
    readonly startedAt: number | null;
    /** When the run stopped: the clock ran out, or the last word was typed. */
    readonly endedAt: number | null;
    /** Characters deleted, for the "corrections" figure. */
    readonly corrections: number;
    /** Oldest first; capped at `MAX_TYPING_SNAPSHOTS`. */
    readonly snapshots: readonly TypingSnapshot[];
};

export type TypingCounts = {
    readonly correct: number;
    readonly incorrect: number;
    readonly extra: number;
    readonly missed: number;
    readonly correctWords: number;
    readonly incorrectWords: number;
    readonly netChars: number;
    readonly rawChars: number;
};

export type TypingSummary = TypingCounts & {
    readonly elapsedMs: number;
    /** Net words per minute: correct words and their spaces, five characters to a word. */
    readonly wpm: number;
    /** Everything typed, five characters to a word, mistakes included. */
    readonly rawWpm: number;
    /** 0–1. Correct characters over everything typed or skipped. */
    readonly accuracy: number;
    /**
     * 0–1. One minus the coefficient of variation of the per-second raw speed;
     * `null` with fewer than three seconds to judge.
     */
    readonly consistency: number | null;
    /** Net words per minute at the end of each whole second, for the chart. */
    readonly perSecond: readonly number[];
    readonly corrections: number;
};

/**
 * What a typing run mixes into plain lower-case words. Each is a switch: the
 * test is one skill at a time by default, and these add the ones that slow a
 * programmer or a writer down — the Shift key, joined words, the symbol row.
 */
export const TYPING_EXTRAS = ["capitals", "camelCase", "symbols", "numbers"] as const;

export type TypingExtra = (typeof TYPING_EXTRAS)[number];

export type TypingExtras = Readonly<Record<TypingExtra, boolean>>;
