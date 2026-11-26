import { LAND_UNITS, type LandOptions, type LandResult } from "../types";
import {
    MAX_AREA_SQUARE_FEET,
    MAX_LAND_INPUT_LENGTH,
    SQUARE_METERS_PER_SQUARE_FOOT,
    UNIT_GROUPS,
} from "./constants";
import { parseArea } from "./parse";
import { comparePitches } from "./pitch";
import { squareFeetPerUnit } from "./units";

/**
 * The one entry point the page, the island and the MCP adapter all call: a
 * typed area in one unit, written out in every unit at once and laid on
 * football pitches.
 *
 * Every unit is shown, not one target. Land in Bangladesh is bought in কাঠা,
 * recorded in শতাংশ, measured in sq ft and taxed in acres, so the reader nearly
 * always needs more than one answer for the same plot.
 */
export function convertLand(input: string, options: LandOptions): LandResult {
    if (input.length > MAX_LAND_INPUT_LENGTH) {
        return { ok: false, reason: "too_large" };
    }

    const parsed = parseArea(input);

    if (!parsed.ok) {
        return parsed;
    }

    const value = parsed.value;
    const squareFeet = value * squareFeetPerUnit(options.unit, options);

    if (!Number.isFinite(squareFeet) || squareFeet > MAX_AREA_SQUARE_FEET) {
        return { ok: false, reason: "too_large" };
    }

    const squareMeters = squareFeet * SQUARE_METERS_PER_SQUARE_FOOT;

    return {
        ok: true,
        value,
        squareFeet,
        squareMeters,
        conversions: LAND_UNITS.map((unit) => ({
            unit,
            group: UNIT_GROUPS[unit],
            // The typed unit is handed back exactly as typed, not as the
            // round trip through square feet, so `5` কাঠা never reads 4.9999.
            value: unit === options.unit ? value : squareFeet / squareFeetPerUnit(unit, options),
        })),
        pitches: comparePitches(squareMeters),
    };
}
