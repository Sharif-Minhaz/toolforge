/**
 * The shared motion vocabulary.
 *
 * Framework-free on purpose: server components import these to space out a
 * grid, the client wrappers import them to animate, and the two cannot drift
 * apart. Nothing here may import React or `motion`.
 */

/** The one easing curve. Every transition in the product uses it. */
export const MOTION_EASE = [0.22, 0.61, 0.36, 1] as const;

/** Seconds. The design system's 200–300ms band — resist adding a fourth entry. */
export const MOTION_DURATION = {
    /** Mount fades for above-the-fold content. */
    enter: 0.3,
    /** Scroll-into-view reveals. */
    reveal: 0.28,
    /** Controls, toggles, and indicator swaps. */
    control: 0.2,
} as const;

/** Seconds between staggered siblings. Past ~0.06 a grid starts to feel slow. */
export const MOTION_STAGGER = 0.04;

/**
 * Delay for the nth child of a staggered list.
 *
 * Capped so a long list still finishes quickly — without the cap the twentieth
 * card waits nearly a second and the page reads as broken.
 */
export function staggerDelay(index: number, maxSteps = 4): number {
    return Math.min(index, maxSteps) * MOTION_STAGGER;
}
