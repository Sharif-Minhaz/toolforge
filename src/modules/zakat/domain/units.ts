import type { WeightUnit } from "../types";
import { parseAmount } from "./amount";
import {
    ANA_PER_VORI,
    GRAMS_PER_UNIT,
    GRAMS_PER_VORI,
    POINT_PER_RATI,
    RATI_PER_ANA,
} from "./constants";
import { div, mul, parseExact, toDecimal, ZERO, type Exact } from "./exact";

/**
 * A weight as a Bangladeshi jeweller writes it: whole vori, ana, rati and
 * point — `2 ভরি 5 আনা 3 রতি` on a receipt. Points are rounded to the nearest
 * whole one (0.01215 g), finer than any shop scale reads.
 */
export type TraditionalWeight = {
    readonly vori: number;
    readonly ana: number;
    readonly rati: number;
    readonly point: number;
};

const POINTS_PER_VORI = ANA_PER_VORI * RATI_PER_ANA * POINT_PER_RATI;

export function toGrams(weight: string, unit: WeightUnit): Exact | null {
    const parsed = parseAmount(weight);

    return parsed.ok ? mul(parsed.value, parseExact(GRAMS_PER_UNIT[unit]) ?? ZERO) : null;
}

export function toTraditional(grams: Exact): TraditionalWeight {
    const vori = div(grams, parseExact(GRAMS_PER_VORI) ?? ZERO);
    const points = Number(toDecimal(mul(vori, parseExact(String(POINTS_PER_VORI)) ?? ZERO), 0));
    const perAna = RATI_PER_ANA * POINT_PER_RATI;
    const perVori = ANA_PER_VORI * perAna;

    return {
        vori: Math.floor(points / perVori),
        ana: Math.floor((points % perVori) / perAna),
        rati: Math.floor((points % perAna) / POINT_PER_RATI),
        point: points % POINT_PER_RATI,
    };
}
