import type { ScrollExtent, ScrollGeometry } from "../types";

function scrollableHeight(extent: ScrollExtent): number {
    return Math.max(0, extent.scrollHeight - extent.clientHeight);
}

/** How far down its own scroll range a pane sits, from 0 to 1. */
export function scrollProgress(geometry: ScrollGeometry): number {
    const range = scrollableHeight(geometry);

    if (range === 0) {
        return 0;
    }

    return Math.min(1, Math.max(0, geometry.scrollTop / range));
}

/**
 * Where the other pane should sit so the two stay level.
 *
 * Proportional rather than line-for-line: a heading occupies one line of source
 * and three of rendered height, so mapping by line number would make the panes
 * drift apart the moment the document is not uniform prose. Matching progress
 * keeps the top and the bottom exactly aligned and everything between close.
 */
export function mapScrollPosition(source: ScrollGeometry, target: ScrollExtent): number {
    return Math.round(scrollProgress(source) * scrollableHeight(target));
}
