"use client";

import { useEffect, useState } from "react";

/**
 * How long a live tool waits after the last keystroke before recomputing.
 * Long enough to skip the intermediate states of a word, short enough that the
 * result still feels immediate.
 */
export const LIVE_UPDATE_DEBOUNCE_MS = 300;

/**
 * Trails `value` by `delayMs`, so an expensive derivation runs once the user
 * stops typing rather than on every character. The first value is adopted
 * immediately, which keeps the server-rendered pass and hydration in step.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = LIVE_UPDATE_DEBOUNCE_MS): T {
    const [settled, setSettled] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setSettled(value), delayMs);

        return () => window.clearTimeout(timer);
    }, [value, delayMs]);

    return settled;
}
