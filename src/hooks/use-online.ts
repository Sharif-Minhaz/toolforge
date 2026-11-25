"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);

    return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
    };
}

/**
 * Whether the browser reports a connection. `true` on the server and during
 * hydration, so the prerendered markup and the first client pass agree; an
 * offline reader sees the change one render later.
 */
export function useOnline(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => navigator.onLine,
        () => true,
    );
}
