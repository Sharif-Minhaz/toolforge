import type { LandUnit } from "../types";

/** One unit's line, already localised by the caller. */
export type SummaryRow = {
    readonly unit: LandUnit;
    /** "0.25", formatted for the reader's locale. */
    readonly figure: string;
    /** "bigha" — the unit's short name. */
    readonly short: string;
    /** "Faridpur size" on a district-sized unit, `null` on a standard one. */
    readonly region: string | null;
};

/**
 * The "Copy all" text: what was typed as a heading, then every other unit on
 * its own line. The typed unit is left out because the heading already says
 * it. A district-sized unit names its district, or the figure means something
 * else to whoever the reader sends it to.
 */
export function buildSummary(
    heading: string,
    typed: LandUnit,
    rows: readonly SummaryRow[],
): string {
    const lines = rows
        .filter((row) => row.unit !== typed && row.figure !== "")
        .map(({ figure, short, region }) =>
            region === null ? `${figure} ${short}` : `${figure} ${short} (${region})`,
        );

    return [heading, ...lines].join("\n");
}
