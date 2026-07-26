"use client";

import { useSyncExternalStore } from "react";

/** The store never changes, so nothing ever needs to be notified. */
const subscribe = () => () => {};

/**
 * `false` while rendering on the server and during the hydration pass, `true`
 * afterwards. Lets a component defer browser-only state (theme, storage) without
 * a hydration mismatch and without setting state from an effect.
 */
export function useIsHydrated(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => true,
        () => false,
    );
}
