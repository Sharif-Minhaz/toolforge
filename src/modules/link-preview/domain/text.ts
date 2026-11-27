/**
 * Cutting preview copy the way a card does, without cutting a character.
 *
 * A limit counted in UTF-16 code units splits an emoji into a lone surrogate
 * and splits a Bangla conjunct — `ক্ষ` is three code points and one thing a
 * reader sees — into a consonant and a dangling virama. Every count here is in
 * grapheme clusters, through `Intl.Segmenter`, which Bun, Node and every
 * browser this site supports agree on.
 *
 * The platforms themselves mostly cut by rendered width, not by count, so a
 * character limit is an approximation of what they do; the card says so. What
 * a count can say exactly is whether the copy is *certainly* too long.
 */

const ELLIPSIS = "…";

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export function countGraphemes(text: string): number {
    return Array.from(segmenter.segment(text)).length;
}

export type Clipped = {
    readonly text: string;
    readonly truncated: boolean;
};

/**
 * At most `limit` graphemes, the last of them an ellipsis when anything was
 * cut. Trailing whitespace before the ellipsis is dropped, because no card
 * renders `word …`.
 */
export function clipGraphemes(text: string, limit: number): Clipped {
    if (limit <= 0) {
        return { text: "", truncated: text.length > 0 };
    }

    const kept: string[] = [];

    for (const { segment } of segmenter.segment(text)) {
        kept.push(segment);

        if (kept.length > limit) {
            const head = kept
                .slice(0, limit - 1)
                .join("")
                .trimEnd();

            return { text: `${head}${ELLIPSIS}`, truncated: true };
        }
    }

    return { text, truncated: false };
}

const encoder = new TextEncoder();

export function countUtf8Bytes(text: string): number {
    return encoder.encode(text).length;
}

/**
 * At most `limit` UTF-8 bytes, ellipsis included, never splitting a grapheme.
 *
 * Discord's limits are bytes, not characters: 70 bytes is seventy letters of
 * English and twenty-three of Bangla, which is why a title that fits every
 * other card can be the one Discord cuts in half.
 */
export function clipUtf8Bytes(text: string, limit: number): Clipped {
    if (countUtf8Bytes(text) <= limit) {
        return { text, truncated: false };
    }

    const budget = limit - countUtf8Bytes(ELLIPSIS);
    let used = 0;
    let head = "";

    for (const { segment } of segmenter.segment(text)) {
        const cost = countUtf8Bytes(segment);

        if (used + cost > budget) {
            break;
        }

        used += cost;
        head += segment;
    }

    return { text: `${head.trimEnd()}${ELLIPSIS}`, truncated: true };
}
