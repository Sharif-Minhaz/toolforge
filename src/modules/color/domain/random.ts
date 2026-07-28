import type { Hsva } from "../types";

/** Source of randomness, injected so tests can hand in a fixed sequence. */
export type RandomSource = () => number;

/**
 * A random colour worth looking at. Drawn in HSV with saturation and value held
 * away from their extremes — a uniform draw over RGB lands on washed-out greys
 * far more often than on anything a person would call a colour.
 */
export function randomColor(random: RandomSource = Math.random): Hsva {
    return {
        h: random() * 360,
        s: 45 + random() * 50,
        v: 55 + random() * 45,
        a: 1,
    };
}
