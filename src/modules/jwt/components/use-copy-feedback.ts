"use client";

import { useEffect, useState } from "react";

/** How long the check mark stays before the copy glyph returns. */
const COPY_FEEDBACK_MS = 1600;

/**
 * Tracks which panel was copied last, clearing itself shortly after. Shared by
 * both directions so the decoder and the encoder feel the same.
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
