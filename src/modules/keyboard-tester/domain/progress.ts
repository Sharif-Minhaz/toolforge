import type { KeyboardLayout, KeySession } from "../types";

/** How far through the drawn board the reader is, and what is left. */
export type KeyboardProgress = {
    readonly tested: number;
    readonly total: number;
    readonly untested: readonly string[];
    /** Keys with at least one chattered press, worst first. */
    readonly chattering: readonly { readonly code: string; readonly count: number }[];
    /** Keys pressed that the drawn board does not have — media keys, F13, Fn layers. */
    readonly extra: readonly string[];
};

export function keyboardProgress(session: KeySession, layout: KeyboardLayout): KeyboardProgress {
    const onBoard = new Set(layout.codes);
    const untested = layout.codes.filter((code) => (session.keys[code]?.presses ?? 0) === 0);

    return {
        tested: layout.codes.length - untested.length,
        total: layout.codes.length,
        untested,
        chattering: Object.entries(session.keys)
            .filter(([, stats]) => stats.chatter > 0)
            .map(([code, stats]) => ({ code, count: stats.chatter }))
            .toSorted((a, b) => b.count - a.count),
        extra: Object.keys(session.keys).filter((code) => !onBoard.has(code)),
    };
}
