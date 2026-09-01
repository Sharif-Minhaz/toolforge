import { describeText } from "@/modules/tools/domain/text-stats";
import type { SortCounts, SortOptions, SortResult } from "../types";
import { buildComparator } from "./compare";
import { MAX_SORT_INPUT_LENGTH, MAX_SORT_ITEMS } from "./constants";
import { BULLET_MARKERS, formatOrdinal, ordinalWidth, stripMarker } from "./markers";
import { shuffleWithSeed } from "./shuffle";
import { splitIntoItems } from "./split";

/**
 * The one transformation the whole tool runs, shared by the server-rendered
 * first paint and every settled keystroke afterwards.
 *
 * Pure and deterministic, seed included — which is why the seed is an argument
 * rather than something drawn in here. Four stages in a fixed order: split,
 * clean, order, format. The order matters and is not negotiable: markers are
 * stripped before anything compares two items, or a list sorts by its own
 * numbering; blanks and duplicates go before the sort, or the answer counts
 * rows that are not in it; and the new markers go on last, or the ordinals
 * would be sorted along with the text they label.
 */
export function sortLines(text: string, options: SortOptions, seed: number): SortResult {
    if ([...text].length > MAX_SORT_INPUT_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    const split = splitIntoItems(text, options.splitMode);

    if (split.items.length > MAX_SORT_ITEMS) {
        return { ok: false, reason: "too_many_items" };
    }

    const cleaned = clean(split.items, options);
    const ordered = order(cleaned.items, options, seed);
    const formatted = format(ordered, options);
    const output = formatted.join("\n");

    if (text.trim().length > 0 && formatted.length === 0) {
        return { ok: false, reason: "empty_result" };
    }

    const counts: SortCounts = {
        lines: describeText(text).lines,
        split: split.items.length,
        joined: split.joined,
        wrapWidth: split.wrapWidth,
        blanksRemoved: cleaned.blanksRemoved,
        duplicatesRemoved: cleaned.duplicatesRemoved,
        items: formatted.length,
    };

    return {
        ok: true,
        text: output,
        items: ordered,
        counts,
        stats: describeText(output),
        unchanged: output === text,
    };
}

type CleanResult = {
    readonly items: readonly string[];
    readonly blanksRemoved: number;
    readonly duplicatesRemoved: number;
};

function clean(items: readonly string[], options: SortOptions): CleanResult {
    const kept: string[] = [];
    const seen = new Set<string>();
    let blanksRemoved = 0;
    let duplicatesRemoved = 0;

    for (const raw of items) {
        // Stripping a marker takes the whitespace in front of it with it, so an
        // indented `- item` is flush even when trimming is off. A line with no
        // marker keeps its indentation, which is what makes trimming a separate
        // switch rather than an implied one.
        const unmarked = options.stripMarkers ? stripMarker(raw).text : raw;
        const item = options.trim ? unmarked.trim() : unmarked;

        if (options.removeEmpty && item.trim().length === 0) {
            blanksRemoved += 1;

            continue;
        }

        if (options.removeDuplicates) {
            const key = options.caseSensitive ? item : item.toLowerCase();

            if (seen.has(key)) {
                duplicatesRemoved += 1;

                continue;
            }

            seen.add(key);
        }

        kept.push(item);
    }

    return { items: kept, blanksRemoved, duplicatesRemoved };
}

function order(items: readonly string[], options: SortOptions, seed: number): readonly string[] {
    switch (options.order) {
        case "original":
            return items;
        case "reverse":
            return [...items].reverse();
        case "shuffle":
            return shuffleWithSeed(items, seed);
        case "ascending":
        case "descending": {
            const compare = buildComparator(options.sortKey, options.caseSensitive);
            const sorted = [...items].sort(compare);

            return options.order === "descending" ? sorted.reverse() : sorted;
        }
    }
}

function format(items: readonly string[], options: SortOptions): readonly string[] {
    if (options.format === "plain") {
        return items;
    }

    if (options.format === "bullet") {
        const marker = BULLET_MARKERS[options.bulletStyle];

        return items.map((item) => (item.length === 0 ? marker : `${marker} ${item}`));
    }

    const width = ordinalWidth(options.startNumber, items.length);

    return items.map((item, index) => {
        const marker = formatOrdinal(options.numberStyle, options.startNumber + index, width);

        return item.length === 0 ? marker : `${marker} ${item}`;
    });
}
