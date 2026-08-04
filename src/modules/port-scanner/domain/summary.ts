import type { PortResult, PortState, ScanSummary } from "../types";

export function summarise(results: readonly PortResult[]): ScanSummary {
    const count = (state: PortState) => results.filter((result) => result.state === state).length;

    return {
        total: results.length,
        open: count("open"),
        closed: count("closed"),
        filtered: count("filtered"),
    };
}

/**
 * Open ports first, then by number.
 *
 * The whole reason somebody runs this is the open ones, and on a 128-port scan
 * they are three rows lost among a hundred refusals. Everything else keeps
 * ascending order, because that is how a reader looks for a specific port.
 */
const STATE_ORDER: Readonly<Record<PortState, number>> = {
    open: 0,
    filtered: 1,
    closed: 2,
};

export function sortResults(results: readonly PortResult[]): readonly PortResult[] {
    return [...results].toSorted((a, b) => {
        const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];

        return byState !== 0 ? byState : a.port - b.port;
    });
}

/**
 * Whether the host answered at all.
 *
 * Every port filtered means one of three things — the host is down, it drops
 * everything, or something between here and there does — and none of them is
 * "these ports are closed". Worth saying out loud, because a wall of `filtered`
 * otherwise reads as a clean bill of health.
 */
export function isFullyFiltered(summary: ScanSummary): boolean {
    return summary.total > 0 && summary.filtered === summary.total;
}
