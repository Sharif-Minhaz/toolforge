import type { BodyStats } from "../types";

/**
 * Published daily averages for an adult, each from the source named beside it.
 * Nothing here is measured or tuned by this tool: the lifetime figures are
 * these rates times the days lived, and the FAQ names the same sources. A
 * child's rates differ from an adult's, so the totals are estimates, and the
 * result says so.
 *
 * A rate the source gives as a range stays a range — the hairs-shed figure is
 * a low and a high, never a midpoint the source did not state.
 */
export const BODY_RATES = {
    /** Cleveland Clinic, "Facts about the heart": "about 100,000 times per day". */
    heartbeatsPerDay: 100_000,
    /** Cleveland Clinic, same page: "nearly 1.5 gallons (5.7 liters)" each minute. */
    bloodLitresPerMinute: 5.7,
    /** American Lung Association: "Each day, we take about 23,000 breaths." */
    breathsPerDay: 23_000,
    /**
     * NASA OCHMO technical brief TB-004 (carbon dioxide), from the Human
     * Integration Design Handbook (2014): per-day metabolic totals for a
     * crewmember on a day without exercise.
     */
    oxygenKgPerDay: 0.72,
    carbonDioxideKgPerDay: 0.91,
    /** American Academy of Dermatology: "normal to shed between 50 and 100 hairs a day". */
    hairsShedPerDay: { low: 50, high: 100 },
    /** Scalp hair, one strand: 0.35 mm a day (StatPearls, via BBC Science Focus). */
    hairMmPerDay: 0.35,
    /**
     * Fingernail, one nail: 3.47 mm a month, the month being 30 days
     * (Yaemsiri et al., J Eur Acad Dermatol Venereol, 2010).
     */
    nailMmPer30Days: 3.47,
} as const;

const MINUTES_PER_DAY = 24 * 60;

/** The rates above, summed over `days` days. Negative or fractional input is programmer error. */
export function lifetimeBodyStats(days: number): BodyStats {
    if (!Number.isInteger(days) || days < 0) {
        throw new RangeError(`days must be a non-negative integer, got ${days}`);
    }

    return {
        days,
        heartbeats: days * BODY_RATES.heartbeatsPerDay,
        bloodLitres: Math.round(days * MINUTES_PER_DAY * BODY_RATES.bloodLitresPerMinute),
        breaths: days * BODY_RATES.breathsPerDay,
        oxygenKg: days * BODY_RATES.oxygenKgPerDay,
        carbonDioxideKg: days * BODY_RATES.carbonDioxideKgPerDay,
        hairsShed: {
            low: days * BODY_RATES.hairsShedPerDay.low,
            high: days * BODY_RATES.hairsShedPerDay.high,
        },
        hairGrownMm: days * BODY_RATES.hairMmPerDay,
        nailGrownMm: (days * BODY_RATES.nailMmPer30Days) / 30,
    };
}
