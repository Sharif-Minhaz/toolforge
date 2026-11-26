import type { LandOptions, LandUnit } from "../types";
import {
    BIGHA_REGION_DECIMALS,
    CHHATAK_PER_KATHA,
    GONDA_PER_KANI,
    KANI_REGION_DECIMALS,
    KATHA_PER_BIGHA,
    KORA_PER_GONDA,
    KRANTI_PER_KORA,
    SQUARE_FEET_PER_ACRE,
    SQUARE_FEET_PER_DECIMAL,
    SQUARE_FEET_PER_SQUARE_HAND,
    SQUARE_METERS_PER_SQUARE_FOOT,
    TIL_PER_KRANTI,
} from "./constants";

type Regions = Pick<LandOptions, "bighaRegion" | "kaniRegion">;

/**
 * One unit in square feet. Every conversion passes through here, so there is
 * one answer to "how big is a কাঠা" and a region changes it everywhere at once.
 *
 * The two chains are each defined from the top: a regional বিঘা carries its
 * কাঠা and ছটাক with it, and a regional কানি its গণ্ডা, কড়া, ক্রান্তি and
 * তিল — because the subdivision (20 কাঠা, 20 গণ্ডা) is the part every
 * district agrees on, and the size of the whole is the part they do not.
 */
export function squareFeetPerUnit(unit: LandUnit, regions: Regions): number {
    const bigha = BIGHA_REGION_DECIMALS[regions.bighaRegion] * SQUARE_FEET_PER_DECIMAL;
    const kani = KANI_REGION_DECIMALS[regions.kaniRegion] * SQUARE_FEET_PER_DECIMAL;
    const gonda = kani / GONDA_PER_KANI;
    const kora = gonda / KORA_PER_GONDA;
    const kranti = kora / KRANTI_PER_KORA;

    switch (unit) {
        case "bigha":
            return bigha;
        case "katha":
            return bigha / KATHA_PER_BIGHA;
        case "chhatak":
            return bigha / KATHA_PER_BIGHA / CHHATAK_PER_KATHA;
        case "kani":
            return kani;
        case "gonda":
            return gonda;
        case "kora":
            return kora;
        case "kranti":
            return kranti;
        case "til":
            return kranti / TIL_PER_KRANTI;
        case "decimal":
            return SQUARE_FEET_PER_DECIMAL;
        case "ojutangsho":
            return SQUARE_FEET_PER_ACRE / 10_000;
        case "square-hand":
            return SQUARE_FEET_PER_SQUARE_HAND;
        case "acre":
            return SQUARE_FEET_PER_ACRE;
        case "hectare":
            return 10_000 / SQUARE_METERS_PER_SQUARE_FOOT;
        case "square-kilometer":
            return 1_000_000 / SQUARE_METERS_PER_SQUARE_FOOT;
        case "square-meter":
            return 1 / SQUARE_METERS_PER_SQUARE_FOOT;
        case "square-foot":
            return 1;
        case "square-yard":
            return 9;
    }
}

/** Whether a unit's size depends on the বিঘা or the কানি region. */
export function regionOf(unit: LandUnit): "bigha" | "kani" | null {
    switch (unit) {
        case "bigha":
        case "katha":
        case "chhatak":
            return "bigha";
        case "kani":
        case "gonda":
        case "kora":
        case "kranti":
        case "til":
            return "kani";
        default:
            return null;
    }
}
