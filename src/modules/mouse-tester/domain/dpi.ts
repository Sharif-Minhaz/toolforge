/**
 * DPI from a swipe of known length.
 *
 * A DPI button changes a setting inside the mouse and tells the computer
 * nothing, so its press cannot be seen. Its effect can: the same hand movement
 * produces a different number of sensor counts. Move the mouse a measured
 * distance with the pointer locked, divide the counts by the distance, and
 * that is the DPI the mouse is actually running at — and doing it once per
 * stage shows whether the button changed anything.
 *
 * Counts are the straight-line distance between where the swipe began and
 * where it ended, not the path length: a hand that wobbles along a ruler adds
 * path but no displacement, and the ruler measured the displacement.
 */

export const DPI_UNITS = ["cm", "in"] as const;

export type DpiUnit = (typeof DPI_UNITS)[number];

export const CENTIMETRES_PER_INCH = 2.54;

export const DEFAULT_DPI_UNIT: DpiUnit = "cm";

export const DEFAULT_DPI_DISTANCE: Readonly<Record<DpiUnit, number>> = { cm: 10, in: 4 };

/** A ruler on a mouse pad; shorter is noise, longer does not fit the desk. */
export const DPI_DISTANCE_RANGE: Readonly<Record<DpiUnit, { min: number; max: number }>> = {
    cm: { min: 2, max: 60 },
    in: { min: 1, max: 24 },
};

/** Fewer counts than this and one count of error is more than one percent. */
export const MIN_DPI_COUNTS = 100;

/**
 * Two stages closer than this share a setting. Five percent is wider than the
 * swipe-to-swipe spread of a steady hand and far narrower than the smallest
 * step any DPI button makes.
 */
export const DPI_SAME_STAGE_TOLERANCE = 0.05;

/** Swipes on one stage disagreeing by more than this point at the hand, not the sensor. */
export const DPI_SPREAD_WARNING = 0.1;

/** Settings mice ship with, for "this reads as a 1600 DPI stage". */
export const COMMON_DPI_SETTINGS = [
    400, 500, 600, 800, 1000, 1200, 1600, 2000, 2400, 3200, 4000, 4800, 6400, 8000, 12000, 16000,
    26000,
] as const;

/** How far a reading may sit from a common setting and still be named after it. */
export const COMMON_DPI_TOLERANCE = 0.15;

export type DpiFailureReason = "too_short" | "invalid_distance";

export type DpiMeasurement =
    | { readonly ok: true; readonly dpi: number; readonly counts: number }
    | { readonly ok: false; readonly reason: DpiFailureReason };

export function distanceInInches(value: number, unit: DpiUnit): number {
    return unit === "in" ? value : value / CENTIMETRES_PER_INCH;
}

export function isValidDistance(value: number, unit: DpiUnit): boolean {
    const range = DPI_DISTANCE_RANGE[unit];

    return Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function measureDpi(
    countsX: number,
    countsY: number,
    distance: number,
    unit: DpiUnit,
): DpiMeasurement {
    if (!isValidDistance(distance, unit)) {
        return { ok: false, reason: "invalid_distance" };
    }

    const counts = Math.hypot(countsX, countsY);

    if (counts < MIN_DPI_COUNTS) {
        return { ok: false, reason: "too_short" };
    }

    return { ok: true, dpi: counts / distanceInInches(distance, unit), counts };
}

export function nearestCommonDpi(dpi: number): number | null {
    let best: number | null = null;
    let bestDistance = Infinity;

    for (const setting of COMMON_DPI_SETTINGS) {
        const distance = Math.abs(dpi - setting) / setting;

        if (distance < bestDistance) {
            best = setting;
            bestDistance = distance;
        }
    }

    return bestDistance <= COMMON_DPI_TOLERANCE ? best : null;
}

export type DpiReading = {
    /** One-based; the reader moves to the next one after pressing the DPI button. */
    readonly stage: number;
    readonly dpi: number;
};

export type DpiStage = {
    readonly stage: number;
    /** The mean of the stage's swipes. */
    readonly dpi: number;
    readonly swipes: number;
    /** Largest minus smallest swipe, as a share of the mean. */
    readonly spread: number;
    /** This stage against the one before, or `null` for the first. */
    readonly ratio: number | null;
    /** The stage reads the same as the one before: the button did not change it. */
    readonly unchanged: boolean;
    /** The common setting it reads as, or `null` when it is near none. */
    readonly nearest: number | null;
};

/** Readings grouped by stage, in stage order, each compared with the one before. */
export function summarizeStages(readings: readonly DpiReading[]): DpiStage[] {
    const byStage = new Map<number, number[]>();

    for (const reading of readings) {
        byStage.set(reading.stage, [...(byStage.get(reading.stage) ?? []), reading.dpi]);
    }

    const stages: DpiStage[] = [];

    for (const stage of [...byStage.keys()].toSorted((a, b) => a - b)) {
        const values = byStage.get(stage) ?? [];
        const dpi = values.reduce((sum, value) => sum + value, 0) / values.length;
        const previous = stages[stages.length - 1];
        const ratio = previous === undefined ? null : dpi / previous.dpi;

        stages.push({
            stage,
            dpi,
            swipes: values.length,
            spread: (Math.max(...values) - Math.min(...values)) / dpi,
            ratio,
            unchanged: ratio !== null && Math.abs(ratio - 1) <= DPI_SAME_STAGE_TOLERANCE,
            nearest: nearestCommonDpi(dpi),
        });
    }

    return stages;
}
