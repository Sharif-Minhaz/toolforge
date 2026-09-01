import { BULLET_STYLES, NUMBER_STYLES, type BulletStyle, type NumberStyle } from "../types";
import { BULLET_MARKERS, formatOrdinal } from "./markers";

/**
 * One sample per marker style, built by the same functions that write the real
 * thing.
 *
 * Deliberately not a hand-written table. A picker whose examples are typed out
 * by an author is a second implementation of the tool, and the first time the
 * two disagree the example is the one a reader believes.
 *
 * The sample word is data rather than copy: what the row shows is the shape of
 * the marker, and `item` reads as `item` in either locale.
 */
const SAMPLE_WORD = "item";

export type BulletSample = {
    readonly style: BulletStyle;
    readonly sample: string;
};

export type NumberSample = {
    readonly style: NumberStyle;
    /** Three ordinals in a row, which is the fewest that shows the sequence. */
    readonly sample: string;
};

export const BULLET_SAMPLES: readonly BulletSample[] = BULLET_STYLES.map((style) => ({
    style,
    sample: `${BULLET_MARKERS[style]} ${SAMPLE_WORD}`,
}));

export const NUMBER_SAMPLES: readonly NumberSample[] = NUMBER_STYLES.map((style) => ({
    style,
    sample: [1, 2, 3].map((value) => formatOrdinal(style, value, 2)).join("  "),
}));
