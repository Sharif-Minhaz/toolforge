"use client";

import { useSyncExternalStore } from "react";

/**
 * What the reader's device can do, read after hydration only. The server
 * cannot know, so it assumes a desktop with a mouse — the common case, and the
 * one where a wrongly shown "no mouse" notice would be the worse mistake.
 */

const FINE_POINTER = "(any-pointer: fine)";

function subscribeToPointer(onChange: () => void) {
    const query = window.matchMedia(FINE_POINTER);

    // Fires when a mouse is plugged into a phone or a tablet, so the notice
    // goes away without a reload.
    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
}

export function useHasFinePointer(): boolean {
    return useSyncExternalStore(
        subscribeToPointer,
        () => window.matchMedia(FINE_POINTER).matches,
        () => true,
    );
}
