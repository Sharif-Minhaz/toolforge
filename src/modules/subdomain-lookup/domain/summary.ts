import { RECENT_WINDOW_MS } from "./constants";
import type { ParsedIndex } from "./parse";
import type { SubdomainSummary } from "../types";

/**
 * The figures above the table.
 *
 * `now` is a parameter rather than a call to the clock, for two reasons that
 * both matter here. The obvious one is testability. The load-bearing one is
 * hydration: "added in the last thirty days" is a count relative to an instant,
 * and computing it in the browser would produce a different number from the one
 * the server rendered. It is stamped once, on the server, and travels with the
 * report.
 */
export function summarize(parsed: ParsedIndex, apex: string, now: Date): SubdomainSummary {
    const cutoff = now.getTime() - RECENT_WINDOW_MS;

    let apexIncluded = false;
    let maxDepth = 0;
    let dated = 0;
    let recent = 0;
    let newestAt: string | null = null;
    let oldestAt: string | null = null;

    for (const record of parsed.records) {
        if (record.name === apex) {
            apexIncluded = true;
        }

        maxDepth = Math.max(maxDepth, record.depth);

        if (record.firstSeen === null) {
            continue;
        }

        dated += 1;

        // ISO-8601 with a fixed `Z` offset sorts correctly as a string, which
        // is why `parse.ts` normalises every date into that form.
        if (newestAt === null || record.firstSeen > newestAt) {
            newestAt = record.firstSeen;
        }

        if (oldestAt === null || record.firstSeen < oldestAt) {
            oldestAt = record.firstSeen;
        }

        if (Date.parse(record.firstSeen) >= cutoff) {
            recent += 1;
        }
    }

    return {
        total: parsed.records.length,
        truncated: parsed.truncated,
        returned: parsed.returned,
        apexIncluded,
        maxDepth,
        dated,
        newestAt,
        oldestAt,
        recent,
    };
}
