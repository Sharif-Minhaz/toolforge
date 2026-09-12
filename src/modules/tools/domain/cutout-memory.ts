import { CUTOUT_QUALITIES, type CutoutQuality } from "../types/segmentation";

/**
 * Which segmentation weights this browser has already fetched.
 *
 * The library fetches each weight file by URL and leans on the browser's HTTP
 * cache, which is shared across every page of this site — so a reader who cut a
 * photograph out on one tool has the file the other tool would fetch. The cache
 * itself cannot be asked: the CDN is cross-origin, and `only-if-cached` is
 * same-origin only. So the fact is written down here at the moment a cut-out
 * succeeds, and every tool that runs the model reads it back to choose its
 * starting tier.
 *
 * Fail-safe in both directions. Storage empty, blocked or edited by hand
 * degrades to the shared default; a recorded tier the cache has since evicted
 * costs a download that would have happened anyway.
 *
 * Storage arrives as a parameter with a browser default, the same shape
 * `short-links/domain/history.ts` uses, so every branch is reachable from a
 * test without a DOM.
 */

export const CUTOUT_MEMORY_KEY = "toolforge.cutout.fetched";

export type CutoutMemoryStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};

function browserStorage(): CutoutMemoryStorage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        // Reading `localStorage` throws outright when storage is blocked by
        // policy, which is a supported way to browse rather than an error.
        return undefined;
    }
}

function isQuality(value: unknown): value is CutoutQuality {
    return typeof value === "string" && (CUTOUT_QUALITIES as readonly string[]).includes(value);
}

/** Every tier recorded as fetched, in no particular order. */
export function readFetchedQualities(
    storage: CutoutMemoryStorage | undefined = browserStorage(),
): readonly CutoutQuality[] {
    if (!storage) {
        return [];
    }

    let raw: string | null;

    try {
        raw = storage.getItem(CUTOUT_MEMORY_KEY);
    } catch {
        return [];
    }

    if (raw === null) {
        return [];
    }

    try {
        const parsed: unknown = JSON.parse(raw);

        return Array.isArray(parsed) ? [...new Set(parsed.filter(isQuality))] : [];
    } catch {
        return [];
    }
}

/**
 * The best tier already on this machine, or `null` when none is.
 *
 * "Best" is the order `CUTOUT_QUALITIES` is declared in — the tiers are listed
 * lightest to heaviest, and heavier is better at the one thing the model is
 * asked to do.
 */
export function bestFetchedQuality(
    storage: CutoutMemoryStorage | undefined = browserStorage(),
): CutoutQuality | null {
    const fetched = readFetchedQualities(storage);
    let best: CutoutQuality | null = null;

    for (const quality of CUTOUT_QUALITIES) {
        if (fetched.includes(quality)) {
            best = quality;
        }
    }

    return best;
}

/**
 * The tier a tool should start on: the one a link names, else the best one
 * already fetched, else the shared default.
 *
 * A link wins because it is explicit. Somebody who sent `?quality=fast` to a
 * friend on a slow connection meant it, and a heavier file the friend happens
 * to have is not what they asked for.
 */
export function resolveStartingQuality(
    named: CutoutQuality | null,
    fallback: CutoutQuality,
    storage: CutoutMemoryStorage | undefined = browserStorage(),
): CutoutQuality {
    if (named !== null) {
        return named;
    }

    return bestFetchedQuality(storage) ?? fallback;
}

/**
 * Records that a tier's weights arrived and ran.
 *
 * Written after success rather than before the fetch, so a download that was
 * abandoned halfway is not remembered as a file the browser has.
 */
export function rememberFetchedQuality(
    quality: CutoutQuality,
    storage: CutoutMemoryStorage | undefined = browserStorage(),
): void {
    if (!storage) {
        return;
    }

    const fetched = readFetchedQualities(storage);

    if (fetched.includes(quality)) {
        return;
    }

    try {
        storage.setItem(CUTOUT_MEMORY_KEY, JSON.stringify([...fetched, quality]));
    } catch {
        // Quota, private mode, policy: a memory of convenience is never worth
        // failing the cut-out that just succeeded.
    }
}
