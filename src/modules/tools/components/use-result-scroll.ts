"use client";

import { useCallback, useRef } from "react";

import { decideResultScroll } from "../domain/result-visibility";

/**
 * Brings a tool's result into view after the press that produced it.
 *
 * A workbench card plus its options is most of a viewport, so on a laptop the
 * answer to the button you just pressed lands below the fold and the page looks
 * as though nothing happened. Every tool whose result arrives from a *discrete
 * action* — a button, not a keystroke — should call this.
 *
 * Three things it gets right that a bare `scrollIntoView` does not:
 *
 * - **It waits a frame.** React commits the new markup before paint, but the
 *   element does not exist yet at the moment the handler sets state. A
 *   `requestAnimationFrame` runs after that commit, so the target is measurable
 *   by the time it is scrolled to.
 * - **It honours `prefers-reduced-motion`.** Smooth scrolling is vestibular
 *   motion, and the media query is read at call time rather than at render, so
 *   a reader who changes the setting mid-session is respected without a
 *   re-render.
 * - **It never scrolls a target that is already in view.** Yanking the page
 *   when the answer is already on screen is worse than not scrolling at all.
 *   "In view" means wholly on screen, or — for a result taller than the
 *   screen — covering most of it; the rule and its reasons are in
 *   `domain/result-visibility.ts`.
 * - **It never scrolls to a gap.** A target that is not mounted yet, or has
 *   nothing in it, is re-measured for a few frames — a commit inside a
 *   transition can land after the first one — and then left alone.
 *
 * Calling it more than once per operation is the intended use for anything
 * that takes a while: once on the press, when a progress panel mounts in the
 * slot the result will take, and again when the result lands. The second call
 * costs nothing when the first already brought the slot into view.
 */

/** How many frames an empty or unmounted target is re-measured before giving up. */
const MAX_WAIT_FRAMES = 10;

export function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

export function useResultScroll<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null);

    const scrollToResult = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }

        let waited = 0;

        const attempt = () => {
            const target = ref.current;
            const decision =
                target === null
                    ? "wait"
                    : decideResultScroll(target.getBoundingClientRect(), window.innerHeight || 0);

            if (decision === "wait" && waited < MAX_WAIT_FRAMES) {
                waited += 1;
                window.requestAnimationFrame(attempt);

                return;
            }

            if (decision !== "scroll" || target === null) {
                return;
            }

            target.scrollIntoView({
                behavior: prefersReducedMotion() ? "auto" : "smooth",
                block: "start",
            });
        };

        window.requestAnimationFrame(attempt);
    }, []);

    return { ref, scrollToResult } as const;
}

/**
 * Brings an interactive surface fully into view — an arena, a canvas — so the
 * reader is not left playing on half of it.
 *
 * Unlike `useResultScroll` it does not settle for "mostly visible": a surface
 * whose bottom edge is under the fold is one where the next target can appear
 * out of sight. It centres the surface when it fits the viewport and aligns
 * its top when it is taller. `instant` exists for the moment a timed run
 * starts, when a smooth scroll would be counted against the reader's first
 * reaction.
 */
export function useFitIntoView<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null);

    const fitIntoView = useCallback((motion: "smooth" | "instant" = "smooth") => {
        if (typeof window === "undefined") {
            return;
        }

        window.requestAnimationFrame(() => {
            const target = ref.current;

            if (target === null) {
                return;
            }

            const box = target.getBoundingClientRect();
            const viewport = window.innerHeight || 0;

            if (box.height === 0 || (box.top >= 0 && box.bottom <= viewport)) {
                return;
            }

            target.scrollIntoView({
                behavior: motion === "instant" || prefersReducedMotion() ? "auto" : "smooth",
                block: box.height > viewport ? "start" : "center",
            });
        });
    }, []);

    return { ref, fitIntoView } as const;
}
