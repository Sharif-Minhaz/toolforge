import type { SortKey } from "../types";

/**
 * The four comparators, all of them written out.
 *
 * Not one of them calls `localeCompare` or builds an `Intl.Collator`, and that
 * is a hydration decision rather than a stylistic one. Collation data comes
 * from the host's ICU: the server's copy and the reader's browser can disagree
 * about where `ä` sits or how a Bangla conjunct compares, and a list that comes
 * back in two different orders either side of hydration is a mismatch React
 * reports without ever naming the cause. `toLowerCase` is used rather than
 * `toLocaleLowerCase` for the same reason — the locale form folds `I` to a
 * dotless `ı` in a Turkish browser and to `i` on the server.
 *
 * The cost is that ordering is by code point rather than by any language's
 * dictionary, so `Z` sorts before `a` unless case folding is on, and accented
 * letters sort after unaccented ones. That is a fact about the tool, stated in
 * its article, and it is at least the same fact everywhere.
 */

/** Code-point order. `<` on strings is UTF-16 order, which differs above the BMP. */
function compareCodePoints(a: string, b: string): number {
    const left = [...a];
    const right = [...b];
    const shared = Math.min(left.length, right.length);

    for (let index = 0; index < shared; index += 1) {
        const difference = (left[index].codePointAt(0) ?? 0) - (right[index].codePointAt(0) ?? 0);

        if (difference !== 0) {
            return difference < 0 ? -1 : 1;
        }
    }

    return left.length - right.length;
}

function fold(value: string, caseSensitive: boolean): string {
    return caseSensitive ? value : value.toLowerCase();
}

/**
 * Digit runs and everything else, so `item2` lands before `item10`.
 *
 * The numbers are compared as digit strings rather than parsed: a line can
 * carry an identifier longer than `Number.MAX_SAFE_INTEGER`, and two of those
 * would compare equal once they had been through a float.
 */
const CHUNKS = /\d+|\D+/gu;

function compareNumericChunks(a: string, b: string): number {
    const left = a.replace(/^0+(?=\d)/u, "");
    const right = b.replace(/^0+(?=\d)/u, "");

    if (left.length !== right.length) {
        return left.length - right.length;
    }

    return left === right ? 0 : left < right ? -1 : 1;
}

function compareNatural(a: string, b: string): number {
    const left = a.match(CHUNKS) ?? [];
    const right = b.match(CHUNKS) ?? [];
    const shared = Math.min(left.length, right.length);

    for (let index = 0; index < shared; index += 1) {
        const one = left[index];
        const other = right[index];
        const bothNumeric = /^\d/u.test(one) && /^\d/u.test(other);
        const difference = bothNumeric
            ? compareNumericChunks(one, other)
            : compareCodePoints(one, other);

        if (difference !== 0) {
            return difference;
        }
    }

    return left.length - right.length;
}

/**
 * The comparator for one sort key, already carrying the case-sensitivity
 * decision.
 *
 * Every one of them falls back to a raw code-point comparison of the untouched
 * strings. Without that, two items differing only in case — or two of the same
 * length under `length` — would compare equal, and "equal" in a sort means
 * "whichever order they arrived in", which is not an order a reader can predict
 * from the controls in front of them.
 */
export function buildComparator(
    sortKey: SortKey,
    caseSensitive: boolean,
): (a: string, b: string) => number {
    if (sortKey === "codepoint") {
        return compareCodePoints;
    }

    if (sortKey === "length") {
        return (a, b) => {
            const difference = [...a].length - [...b].length;

            if (difference !== 0) {
                return difference;
            }

            return (
                compareCodePoints(fold(a, caseSensitive), fold(b, caseSensitive)) ||
                compareCodePoints(a, b)
            );
        };
    }

    if (sortKey === "natural") {
        return (a, b) =>
            compareNatural(fold(a, caseSensitive), fold(b, caseSensitive)) ||
            compareCodePoints(a, b);
    }

    return (a, b) =>
        compareCodePoints(fold(a, caseSensitive), fold(b, caseSensitive)) ||
        compareCodePoints(a, b);
}
