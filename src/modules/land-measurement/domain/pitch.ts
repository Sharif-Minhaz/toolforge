import type { PitchComparison, PlotShape } from "../types";
import { MAX_DRAWN_PITCHES, PITCH_LENGTH_METERS, PITCH_WIDTH_METERS } from "./constants";

export const PITCH_AREA_SQUARE_METERS = PITCH_LENGTH_METERS * PITCH_WIDTH_METERS;

/**
 * A conversion that lands on exactly two pitches arrives as 1.9999999999 after
 * a round trip through square feet. Without this it would draw one full pitch
 * and a second holding an invisible sliver.
 */
const WHOLE_PITCH_TOLERANCE = 1e-9;

/**
 * An area laid out on football pitches: as many full ones as it fills, then
 * one holding what is left, drawn to scale. Pure geometry in metres, so the
 * drawing only has to scale it.
 */
export function comparePitches(squareMeters: number): PitchComparison {
    const exact = squareMeters / PITCH_AREA_SQUARE_METERS;
    const nearest = Math.round(exact);
    const ratio =
        nearest > 0 && Math.abs(exact - nearest) <= WHOLE_PITCH_TOLERANCE * nearest
            ? nearest
            : exact;

    const fullPitches = Math.floor(ratio);
    const remainderArea = (ratio - fullPitches) * PITCH_AREA_SQUARE_METERS;
    const needed = fullPitches + (remainderArea > 0 ? 1 : 0);
    const truncated = needed > MAX_DRAWN_PITCHES;

    return {
        ratio,
        fullPitches,
        // An empty field is still drawn: a zero is an answer, and the pitch is
        // the thing the reader came to compare against.
        drawnPitches: Math.max(1, Math.min(needed, MAX_DRAWN_PITCHES)),
        // When the drawing stops early every pitch it shows is a full one, so
        // there is no partial pitch to draw.
        remainder: remainderArea > 0 && !truncated ? plotShape(remainderArea) : null,
        truncated,
    };
}

/**
 * Part of one pitch: a square in the middle while one fits between the
 * touchlines, then a strip the pitch's full width, centred on the halfway line.
 */
export function plotShape(squareMeters: number): PlotShape {
    const side = Math.sqrt(squareMeters);

    if (side <= PITCH_WIDTH_METERS) {
        return {
            kind: "square",
            x: (PITCH_LENGTH_METERS - side) / 2,
            y: (PITCH_WIDTH_METERS - side) / 2,
            width: side,
            height: side,
        };
    }

    const length = squareMeters / PITCH_WIDTH_METERS;

    return {
        kind: "strip",
        x: (PITCH_LENGTH_METERS - length) / 2,
        y: 0,
        width: length,
        height: PITCH_WIDTH_METERS,
    };
}
