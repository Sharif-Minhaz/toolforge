import { randomIndex } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";

import type {
    TypingCounts,
    TypingDuration,
    TypingLanguage,
    TypingRun,
    TypingSnapshot,
    TypingSummary,
    WordScore,
} from "../types";
import {
    CHARS_PER_WORD,
    MAX_TYPED_WORD_LENGTH,
    MAX_TYPING_SNAPSHOTS,
    MIN_CONSISTENCY_SECONDS,
    TYPING_WORDS_PER_SECOND,
} from "./constants";
import { typingWords } from "./typing-words";

/**
 * A typing run, as a pure reducer over what the input box holds.
 *
 * The box is read by **value**, not by keystroke. That is what lets one scorer
 * serve English and Bangla alike: a phonetic Bangla keyboard (Avro) types `k`,
 * shows `ক`, and replaces it when `h` follows — keystroke by keystroke that is an
 * error and a fix, value by value it is just the word arriving. A word is judged
 * once, when a space commits it, the way the 10FastFingers family of tests does.
 *
 * Every count is in code points after NFC normalisation, so `য়` typed either way
 * is one character and matches the list either way.
 */

const WHITESPACE = /\s/u;

function codePoints(text: string): string[] {
    return [...text.normalize("NFC")];
}

/** Draws `count` words, never the same word twice in a row. */
export function drawTypingWords(
    language: TypingLanguage,
    count: number,
    randomBytes: RandomBytes,
): string[] {
    const pool = typingWords(language);
    const words: string[] = [];

    while (words.length < count) {
        const word = pool[randomIndex(pool.length, randomBytes)];

        if (word !== words.at(-1)) {
            words.push(word);
        }
    }

    return words;
}

/** Enough words that nobody runs out before the clock does. */
export function wordsForDuration(duration: TypingDuration): number {
    return duration * TYPING_WORDS_PER_SECOND;
}

export function createTypingRun(words: readonly string[]): TypingRun {
    return {
        words: words.map((word) => word.normalize("NFC")),
        typed: [],
        current: "",
        startedAt: null,
        endedAt: null,
        corrections: 0,
        snapshots: [],
    };
}

export function scoreWord(target: string, typed: string): WordScore {
    const want = codePoints(target);
    const got = codePoints(typed);
    const overlap = Math.min(want.length, got.length);
    let correct = 0;

    for (let index = 0; index < overlap; index += 1) {
        if (want[index] === got[index]) {
            correct += 1;
        }
    }

    const extra = Math.max(0, got.length - want.length);
    const missed = Math.max(0, want.length - got.length);

    return {
        correct,
        incorrect: overlap - correct,
        extra,
        missed,
        exact: correct === want.length && extra === 0,
    };
}

/** Whether what is typed so far could still become the target. */
export function isOnTrack(target: string, typed: string): boolean {
    return target.normalize("NFC").startsWith(typed.normalize("NFC"));
}

export function countTyping(run: TypingRun): TypingCounts {
    let correct = 0;
    let incorrect = 0;
    let extra = 0;
    let missed = 0;
    let correctWords = 0;
    let netChars = 0;
    let rawChars = 0;

    run.typed.forEach((typed, index) => {
        const score = scoreWord(run.words[index] ?? "", typed);
        const length = codePoints(typed).length;

        correct += score.correct;
        incorrect += score.incorrect;
        extra += score.extra;
        missed += score.missed;
        // The space that committed the word is a keystroke too.
        rawChars += length + 1;

        if (score.exact) {
            correctWords += 1;
            netChars += length + 1;
        }
    });

    // The word under the caret: what is typed so far is scored, nothing is
    // missed yet, and it counts towards net speed only while still on track —
    // so a run that ends mid-word is not robbed of it.
    if (run.current.length > 0) {
        const target = run.words[run.typed.length] ?? "";
        const score = scoreWord(target, run.current);
        const length = codePoints(run.current).length;

        correct += score.correct;
        incorrect += score.incorrect;
        extra += score.extra;
        rawChars += length;

        if (isOnTrack(target, run.current)) {
            netChars += length;
        }
    }

    return {
        correct,
        incorrect,
        extra,
        missed,
        correctWords,
        incorrectWords: run.typed.length - correctWords,
        netChars,
        rawChars,
    };
}

function snapshot(run: TypingRun, at: number): TypingSnapshot[] {
    if (run.startedAt === null || run.snapshots.length >= MAX_TYPING_SNAPSHOTS) {
        return [...run.snapshots];
    }

    const counts = countTyping(run);

    return [
        ...run.snapshots,
        { at: at - run.startedAt, netChars: counts.netChars, rawChars: counts.rawChars },
    ];
}

/** Whether the clock has run out at `at`. */
export function isExpired(run: TypingRun, at: number, durationMs: number): boolean {
    return run.startedAt !== null && at - run.startedAt >= durationMs;
}

/**
 * Stops the run at `at`. Idempotent, and a no-op before the first keystroke.
 * Called by the timer when the clock runs out, so the result does not wait for
 * the reader's next key.
 */
export function finishTyping(run: TypingRun, at: number, durationMs: number): TypingRun {
    if (run.startedAt === null || run.endedAt !== null) {
        return run;
    }

    return { ...run, endedAt: Math.min(at, run.startedAt + durationMs) };
}

/**
 * Applies what the input box now holds.
 *
 * Whitespace commits: everything before the last space becomes finished words,
 * and what follows is the new word under the caret. A shorter value than before
 * is a deletion, counted as a correction. Committed words cannot be reopened —
 * Backspace on an empty box does nothing — because a test that lets you go back
 * and fix a word three lines up is measuring patience, not typing.
 */
export function applyTypingValue(
    run: TypingRun,
    value: string,
    at: number,
    durationMs: number,
): TypingRun {
    if (run.endedAt !== null) {
        return run;
    }

    if (isExpired(run, at, durationMs)) {
        return finishTyping(run, at, durationMs);
    }

    // A leading space on an empty box commits nothing and starts nothing.
    const normalised = run.current.length === 0 ? value.replace(/^\s+/u, "") : value;

    if (normalised.length === 0 && run.current.length === 0) {
        return run;
    }

    const startedAt = run.startedAt ?? at;
    const parts = normalised.split(WHITESPACE);
    const trailing = parts.pop() ?? "";
    const committed = parts.filter((part) => part.length > 0);
    const typed = [...run.typed];

    for (const word of committed) {
        if (typed.length >= run.words.length) {
            break;
        }

        typed.push(word.slice(0, MAX_TYPED_WORD_LENGTH));
    }

    const current =
        typed.length >= run.words.length ? "" : trailing.slice(0, MAX_TYPED_WORD_LENGTH);
    const deleted =
        committed.length === 0
            ? Math.max(0, codePoints(run.current).length - codePoints(current).length)
            : 0;

    const next: TypingRun = {
        ...run,
        typed,
        current,
        startedAt,
        corrections: run.corrections + deleted,
    };
    const withSnapshot: TypingRun = { ...next, snapshots: snapshot(next, at) };

    // The last word of the list was committed: the run is over early.
    return typed.length >= run.words.length ? { ...withSnapshot, endedAt: at } : withSnapshot;
}

function perMinute(chars: number, elapsedMs: number): number {
    return elapsedMs <= 0 ? 0 : chars / CHARS_PER_WORD / (elapsedMs / 60_000);
}

/** The last snapshot at or before `at`, or zeros before any. */
function snapshotAt(snapshots: readonly TypingSnapshot[], at: number): TypingSnapshot {
    let found: TypingSnapshot = { at: 0, netChars: 0, rawChars: 0 };

    for (const entry of snapshots) {
        if (entry.at > at) {
            break;
        }

        found = entry;
    }

    return found;
}

/**
 * The run's figures at `at` (the end, once it has one).
 *
 * Net speed counts only correct words, plus the space after each, because that
 * is what a reader of the text would receive; raw speed counts everything.
 * Consistency is taken over the raw characters typed in each second, so a
 * steady typist scores near 100% whatever their speed.
 */
export function summarizeTyping(run: TypingRun, at: number, durationMs: number): TypingSummary {
    const counts = countTyping(run);
    const end = run.endedAt ?? at;
    const elapsedMs =
        run.startedAt === null ? 0 : Math.min(Math.max(0, end - run.startedAt), durationMs);
    const judged = counts.correct + counts.incorrect + counts.extra + counts.missed;

    const seconds = Math.floor(elapsedMs / 1000);
    const perSecond: number[] = [];
    const rawPerSecond: number[] = [];
    let previousRaw = 0;

    for (let second = 1; second <= seconds; second += 1) {
        const entry = snapshotAt(run.snapshots, second * 1000);

        perSecond.push(perMinute(entry.netChars, second * 1000));
        rawPerSecond.push(entry.rawChars - previousRaw);
        previousRaw = entry.rawChars;
    }

    return {
        ...counts,
        elapsedMs,
        wpm: perMinute(counts.netChars, elapsedMs),
        rawWpm: perMinute(counts.rawChars, elapsedMs),
        accuracy: judged === 0 ? 0 : counts.correct / judged,
        consistency: consistencyOf(rawPerSecond),
        perSecond,
        corrections: run.corrections,
    };
}

function consistencyOf(values: readonly number[]): number | null {
    if (values.length < MIN_CONSISTENCY_SECONDS) {
        return null;
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    if (mean === 0) {
        return 0;
    }

    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

    return Math.min(1, Math.max(0, 1 - Math.sqrt(variance) / mean));
}
