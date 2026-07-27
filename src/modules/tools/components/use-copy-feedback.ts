"use client";

import { useEffect, useState } from "react";

/** How long the check mark stays before the copy glyph returns. */
const COPY_FEEDBACK_MS = 1600;

/**
 * Tracks which panel was copied last, clearing itself shortly after. One hook
 * per workbench rather than one per button, so every panel in a tool agrees on
 * how long the check mark lingers.
 */
export function useCopyFeedback<T extends string>(): [T | null, (panel: T) => void] {
    const [copied, setCopied] = useState<T | null>(null);

    useEffect(() => {
        if (copied === null) {
            return;
        }

        const timer = window.setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);

        return () => window.clearTimeout(timer);
    }, [copied]);

    return [copied, setCopied];
}
