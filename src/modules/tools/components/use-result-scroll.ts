"use client";

import { useCallback, useRef } from "react";

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
 */

/** Anything at least this visible is already being read; leave it alone. */
const ALREADY_VISIBLE_RATIO = 0.4;

export function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

function isMostlyVisible(element: HTMLElement): boolean {
    const box = element.getBoundingClientRect();
    const viewport = window.innerHeight || 0;
    const visible = Math.min(box.bottom, viewport) - Math.max(box.top, 0);

    return box.height > 0 && visible / Math.min(box.height, viewport) >= ALREADY_VISIBLE_RATIO;
}

export function useResultScroll<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null);

    const scrollToResult = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }

        window.requestAnimationFrame(() => {
            const target = ref.current;

            if (target === null || isMostlyVisible(target)) {
                return;
            }

            target.scrollIntoView({
                behavior: prefersReducedMotion() ? "auto" : "smooth",
                block: "start",
            });
        });
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
