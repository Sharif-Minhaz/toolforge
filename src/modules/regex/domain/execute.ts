import type { RegexCapture, RegexGroupInfo, RegexMatch } from "../types";
import { MATCH_TIME_BUDGET_MS, MAX_MATCHES, TIME_CHECK_INTERVAL } from "./constants";

export type ExecutionLimits = {
    readonly maxMatches: number;
    readonly timeBudgetMs: number;
};

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
    maxMatches: MAX_MATCHES,
    timeBudgetMs: MATCH_TIME_BUDGET_MS,
};

export type ExecutionResult = {
    readonly matches: readonly RegexMatch[];
    /** The cap was reached; there are more matches than are being shown. */
    readonly truncated: boolean;
    readonly timedOut: boolean;
    readonly durationMs: number;
};

/** Injected so tests can drive the budget without waiting for a real clock. */
export type Clock = () => number;

const defaultClock: Clock = () =>
    typeof performance === "undefined" ? Date.now() : performance.now();

function toCapture(
    index: number,
    value: string | undefined,
    pair: readonly [number, number] | undefined,
    groups: readonly RegexGroupInfo[],
): RegexCapture {
    return {
        index,
        name: groups.find((group) => group.index === index)?.name ?? null,
        // A group that took no part in the match is `undefined`, which is not
        // the same as one that matched the empty string.
        value: value ?? null,
        start: pair?.[0] ?? null,
        end: pair?.[1] ?? null,
    };
}

function toMatch(result: RegExpExecArray, groups: readonly RegexGroupInfo[]): RegexMatch {
    const captures: RegexCapture[] = [];

    for (let index = 1; index < result.length; index += 1) {
        captures.push(toCapture(index, result[index], result.indices?.[index], groups));
    }

    return {
        start: result.index,
        end: result.index + result[0].length,
        value: result[0],
        captures,
    };
}

/**
 * A zero-length match leaves `lastIndex` where it was, so the loop has to step
 * over it by hand — and by a whole code point under `u`, or the step lands
 * between the halves of a surrogate pair.
 */
function stepOverEmptyMatch(regex: RegExp, text: string): void {
    const code = text.codePointAt(regex.lastIndex);

    regex.lastIndex += regex.unicode && code !== undefined && code > 0xffff ? 2 : 1;
}

export function findMatches(
    regex: RegExp,
    text: string,
    groups: readonly RegexGroupInfo[],
    limits: ExecutionLimits = DEFAULT_EXECUTION_LIMITS,
    clock: Clock = defaultClock,
): ExecutionResult {
    const startedAt = clock();

    // Without `g` or `y` the engine only ever reports the first match, and
    // looping would return that same match forever.
    if (!regex.global && !regex.sticky) {
        const single = regex.exec(text);

        return {
            matches: single === null ? [] : [toMatch(single, groups)],
            truncated: false,
            timedOut: false,
            durationMs: clock() - startedAt,
        };
    }

    const matches: RegexMatch[] = [];
    let truncated = false;
    let timedOut = false;
    let iterations = 0;

    regex.lastIndex = 0;

    for (;;) {
        const result = regex.exec(text);

        if (result === null) {
            break;
        }

        matches.push(toMatch(result, groups));

        if (result[0].length === 0) {
            stepOverEmptyMatch(regex, text);
        }

        if (matches.length >= limits.maxMatches) {
            truncated = true;
            break;
        }

        iterations += 1;

        // `performance.now()` is not free, so the budget is consulted in
        // batches. This can only stop the loop between matches — a single
        // catastrophic match is the worker's kill timer to deal with.
        if (iterations % TIME_CHECK_INTERVAL === 0 && clock() - startedAt > limits.timeBudgetMs) {
            timedOut = true;
            break;
        }
    }

    return { matches, truncated, timedOut, durationMs: clock() - startedAt };
}
