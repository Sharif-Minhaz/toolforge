import type {
    KeyboardSize,
    KeyboardStandard,
    KeyLabelSystem,
    TypingDuration,
    TypingLanguage,
} from "../types";

export const DEFAULT_KEYBOARD_SIZE: KeyboardSize = "full";

export const DEFAULT_KEYBOARD_STANDARD: KeyboardStandard = "ansi";

export const DEFAULT_KEY_LABEL_SYSTEM: KeyLabelSystem = "windows";

/**
 * Press to press, the line between a fast finger and a bouncing switch. A fast
 * trill on one key is eight or nine presses a second — over a hundred
 * milliseconds apart — while a chattering switch doubles a letter within a few
 * tens of them.
 */
export const DEFAULT_KEY_FAULT_WINDOW_MS = 40;

export const MIN_KEY_FAULT_WINDOW_MS = 15;

export const MAX_KEY_FAULT_WINDOW_MS = 100;

export const KEY_FAULT_WINDOW_STEP_MS = 5;

/** The newest presses the history keeps. */
export const MAX_KEY_HISTORY = 60;

/** The chatter records the report keeps. */
export const MAX_KEY_CHATTER_RECORDS = 500;

/** Repeats needed before a repeat rate is reported. */
export const MIN_REPEATS_FOR_READING = 4;

/** Holding Escape this long gives the keyboard back to the page. */
export const ESCAPE_RELEASE_MS = 1500;

/**
 * USB's boot protocol reports six keys besides the modifiers. A board that
 * never gets past six at once is either a six-key-rollover board or one
 * running in boot mode; anything above is n-key rollover.
 */
export const BOOT_PROTOCOL_KEYS = 6;

/** Keys that are modifiers, counted apart for the rollover reading. */
export const MODIFIER_CODES: ReadonlySet<string> = new Set([
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
]);

/** Five characters to a word, the convention every typing test reports in. */
export const CHARS_PER_WORD = 5;

export const DEFAULT_TYPING_DURATION: TypingDuration = 60;

export const DEFAULT_TYPING_LANGUAGE: TypingLanguage = "english";

/**
 * Words drawn per second of the run. Four a second is 240 words a minute,
 * past the fastest sustained typing anybody records, so a run is never cut
 * short by running out of text.
 */
export const TYPING_WORDS_PER_SECOND = 4;

/** Input events the speed chart keeps; past this, a run would grow without bound. */
export const MAX_TYPING_SNAPSHOTS = 6000;

/**
 * Longest a single typed word may grow. Holding a key down in one word would
 * otherwise build a string the display has to lay out letter by letter.
 */
export const MAX_TYPED_WORD_LENGTH = 40;

/** Seconds of speed needed before consistency means anything. */
export const MIN_CONSISTENCY_SECONDS = 3;
