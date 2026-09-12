"use client";

import { useState } from "react";

import { useIsHydrated } from "@/hooks/use-is-hydrated";

import { resolveStartingQuality } from "../domain/cutout-memory";
import { DEFAULT_CUTOUT_QUALITY } from "../domain/segmentation";
import type { CutoutQuality } from "../types/segmentation";

/**
 * Which segmentation tier a tool starts on, and the setter for its picker.
 *
 * The server cannot know what this browser has already fetched, so the server
 * pass and the hydration pass both use the link's choice or the shared default,
 * and the recorded best tier is adopted once, after hydration — adjusted during
 * render rather than from an effect, which is React's own answer for state that
 * follows a value the first render could not see, and stays clear of
 * `react-hooks/set-state-in-effect`.
 *
 * Adopted *once*, on purpose. The reader's own pick afterwards must not be
 * overwritten by the memory on the next render.
 */
export function useCutoutQuality(
    named: CutoutQuality | null,
): [CutoutQuality, (next: CutoutQuality) => void] {
    const hydrated = useIsHydrated();
    const [quality, setQuality] = useState<CutoutQuality>(named ?? DEFAULT_CUTOUT_QUALITY);
    const [adopted, setAdopted] = useState(false);

    if (hydrated && !adopted) {
        setAdopted(true);

        const resolved = resolveStartingQuality(named, DEFAULT_CUTOUT_QUALITY);

        if (resolved !== quality) {
            setQuality(resolved);
        }
    }

    return [quality, setQuality];
}
