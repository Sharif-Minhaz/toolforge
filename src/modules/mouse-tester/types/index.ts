/**
 * The five buttons a browser reports by number. `MouseEvent.button` 0–4 in
 * that order is the only mapping every engine agrees on; a sixth button, where
 * a driver exposes one at all, arrives as 5 or above and is not counted.
 */
export const MOUSE_BUTTONS = ["left", "middle", "right", "back", "forward"] as const;

export type MouseButton = (typeof MOUSE_BUTTONS)[number];

/** Up and down are the wheel; left and right are a tilt wheel or a side scroll. */
export const WHEEL_DIRECTIONS = ["up", "down", "left", "right"] as const;

export type WheelDirection = (typeof WHEEL_DIRECTIONS)[number];

export type WheelAxis = "vertical" | "horizontal";

/**
 * The three ways a mouse fails that a browser can see, named for the cause
 * rather than the symptom:
 *
 * - `chatter` — one press arrives as two: the switch bounced on its way down
 *   or up. Felt as an unwanted double click.
 * - `drop` — a held button let go for a few milliseconds and came back. Felt as
 *   a drag that falls out of the hand halfway: a file dropped in the wrong
 *   folder, a text selection that ends early.
 * - `reversal` — one wheel notch, inside a steady scroll, reported the wrong
 *   way. Felt as a page that jumps back while you scroll.
 */
export const FAULT_KINDS = ["chatter", "drop", "reversal"] as const;

export type FaultKind = (typeof FAULT_KINDS)[number];

/** What the diagnosis says about one control, worst last. */
export const VERDICTS = ["untested", "testing", "healthy", "suspect", "faulty"] as const;

export type Verdict = (typeof VERDICTS)[number];

/** Whether a long press has been held long enough to prove it does not drop. */
export const HOLD_RESULTS = ["notRun", "passed", "dropped"] as const;

export type HoldResult = (typeof HOLD_RESULTS)[number];

/** Something the reader did, as the session reducer receives it. `time` is in milliseconds. */
export type MouseInput =
    | { readonly type: "press"; readonly button: MouseButton; readonly time: number }
    | { readonly type: "release"; readonly button: MouseButton; readonly time: number }
    | { readonly type: "wheel"; readonly direction: WheelDirection; readonly time: number }
    /** The window lost focus with buttons down; their releases will never arrive. */
    | { readonly type: "cancel"; readonly time: number }
    /**
     * A keystroke while the pointer was over the area. Mouse software that
     * remaps an extra or macro button usually makes it type a key, and this is
     * the only trace such a button leaves.
     */
    | { readonly type: "key"; readonly code: string; readonly time: number };

export type ButtonStats = {
    readonly presses: number;
    readonly chatter: number;
    readonly drops: number;
    readonly held: boolean;
    readonly lastDown: number | null;
    readonly lastUp: number | null;
    /** Press to press, in milliseconds, for the most recent press after the first. */
    readonly lastInterval: number | null;
    /** The longest hold that ended in a release, in milliseconds. */
    readonly longestHold: number;
};

export type WheelNotch = {
    readonly direction: WheelDirection;
    readonly time: number;
    /** The log entry that recorded it, so a reversal found later can mark it. */
    readonly logId: number;
};

export type WheelStats = {
    readonly counts: Readonly<Record<WheelDirection, number>>;
    readonly reversals: number;
    /** The last two notches per axis — what a reversal needs to be recognised. */
    readonly recent: Readonly<Record<WheelAxis, readonly WheelNotch[]>>;
};

type LogEntryBase = {
    readonly id: number;
    /** Milliseconds since the session's first event. */
    readonly at: number;
    readonly fault: FaultKind | null;
};

/**
 * One line of the event log. A union on `kind`, because "left" is both a
 * button and a tilt direction and only the kind says which.
 */
export type LogEntry =
    | (LogEntryBase & {
          readonly kind: "press";
          readonly control: MouseButton;
          /** Press to press for the same button, where there was an earlier press. */
          readonly interval: number | null;
      })
    | (LogEntryBase & {
          readonly kind: "release";
          readonly control: MouseButton;
          /** How long the button was down. */
          readonly hold: number;
      })
    | (LogEntryBase & { readonly kind: "wheel"; readonly control: WheelDirection })
    | (LogEntryBase & {
          readonly kind: "key";
          /** `KeyboardEvent.code` — `F13`, `KeyB` — a machine name, never translated. */
          readonly code: string;
      });

export type FaultRecord = {
    readonly kind: FaultKind;
    readonly control: MouseButton | "wheel";
    /** Milliseconds since the session's first event. */
    readonly at: number;
    /**
     * The measurement that tripped it: press to press for chatter, the release
     * gap for a drop, the time since the notch before for a reversal.
     */
    readonly gap: number;
};

export type MouseSession = {
    /** The first event's timestamp; every `at` is counted from it. */
    readonly startedAt: number | null;
    readonly buttons: Readonly<Record<MouseButton, ButtonStats>>;
    readonly wheel: WheelStats;
    /** Newest first. */
    readonly log: readonly LogEntry[];
    /** Oldest first, for the report. */
    readonly faults: readonly FaultRecord[];
    readonly nextId: number;
    /** Clean press times inside the last second, for clicks per second. */
    readonly recentPresses: readonly number[];
    readonly peakCps: number;
    /**
     * How long the most recent hold-test attempt lasted, in milliseconds. The
     * latest attempt rather than the best: a bar that stays full after a short
     * second try would claim a hold that did not happen.
     */
    readonly lastHoldAttempt: number | null;
    /** Keystrokes seen while the pointer was over the area. */
    readonly keystrokes: number;
};

export type MouseSettings = {
    /** Below this, press to press, a second press is a bounce rather than a person. */
    readonly faultWindowMs: number;
};

export type PollingSummary = {
    /** From the median interval, so a stall or a burst does not drag it. */
    readonly medianHz: number;
    readonly averageHz: number;
    /** Standard deviation of the interval as a share of its mean, in percent. */
    readonly jitterPercent: number;
    /** The standard rate the median is closest to, or `null` when it is near none. */
    readonly rateClass: number | null;
    readonly samples: number;
};

/**
 * What this page does with a mouse: check every button and the wheel, or
 * measure how well the hand behind it aims. One page, because a mouse that
 * passes the first and still feels wrong is usually a question for the second.
 */
export const MOUSE_TESTER_MODES = ["buttons", "aim"] as const;

export type MouseTesterMode = (typeof MOUSE_TESTER_MODES)[number];

/** How long an aim run lasts, in seconds. */
export const AIM_DURATIONS = [30, 60] as const;

export type AimDuration = (typeof AIM_DURATIONS)[number];

/** Target sizes, largest first. */
export const AIM_TARGET_SIZES = ["large", "medium", "small"] as const;

export type AimTargetSize = (typeof AIM_TARGET_SIZES)[number];

/** A position in arena units — see `AIM_ARENA` — never in screen pixels. */
export type AimPoint = { readonly x: number; readonly y: number };

export type AimTarget = AimPoint & {
    readonly id: number;
    readonly radius: number;
    /** `performance.now()` when it appeared. */
    readonly spawnedAt: number;
    /** Where the pointer was judged to be when it appeared: the last shot, or the start. */
    readonly from: AimPoint;
};

export type AimShot = {
    readonly at: number;
    readonly hit: boolean;
    /** Shot minus target centre, as a fraction of the radius: 1 is the rim. */
    readonly offset: AimPoint;
    /** For a hit: appearance to hit. */
    readonly timeMs: number;
    /** Fitts's index of difficulty, log₂(D / W + 1), for a hit. */
    readonly difficulty: number;
};

export type AimRun = {
    readonly startedAt: number | null;
    readonly endedAt: number | null;
    readonly target: AimTarget | null;
    /** Oldest first; capped at `MAX_AIM_SHOTS`. */
    readonly shots: readonly AimShot[];
    readonly nextId: number;
};

export type AimSummary = {
    readonly hits: number;
    readonly misses: number;
    /** 0–1, hits over every shot; 0 before the first. */
    readonly accuracy: number;
    readonly medianTimeMs: number | null;
    readonly bestTimeMs: number | null;
    /** Mean of ID / MT over every hit, in bits per second; `null` before the first. */
    readonly throughput: number | null;
    /** Mean hit offset, as a fraction of the radius — which way the hand pulls. */
    readonly bias: AimPoint | null;
    /** Mean distance of a hit from centre, as a fraction of the radius: 0 is dead centre. */
    readonly spread: number | null;
    /** Hit offsets, for the grouping plot. */
    readonly offsets: readonly AimPoint[];
};

/** Which way a grouping sits from centre, as a reader would say it. */
export const AIM_BIAS_DIRECTIONS = [
    "centred",
    "high",
    "low",
    "left",
    "right",
    "highLeft",
    "highRight",
    "lowLeft",
    "lowRight",
] as const;

export type AimBiasDirection = (typeof AIM_BIAS_DIRECTIONS)[number];
