/**
 * The topics the Photo tab offers, and the search terms behind them.
 *
 * This exists because a background remover wants **backdrops**, and a stock
 * library's front page is full of portraits. Pexels' `/v1/curated` feed is
 * whatever their editors are featuring, which is people more often than not —
 * and a photograph of somebody else is the one thing that is never a useful
 * background for a photograph of you.
 *
 * There is no "no people" flag in the Pexels API, so this is the first of two
 * blunt instruments. Seeding the search with terms that describe *places* gets
 * most of the way there on its own; `hidesPeople` in `pexels.ts` catches some of
 * the rest. Neither is exact, and the copy says so rather than promising a
 * filter that does not exist.
 */

/**
 * A literal union, so `t(\`topics.${topic}\`)` is checked at compile time —
 * `docs/internationalization.md`.
 */
export const BACKDROP_TOPICS = [
    "nature",
    "mountains",
    "forest",
    "water",
    "beach",
    "sky",
    "grass",
    "flowers",
    "wildlife",
    "interior",
    "architecture",
    "city",
    "artwork",
    "texture",
] as const;

export type BackdropTopic = (typeof BACKDROP_TOPICS)[number];

/**
 * What each chip actually asks Pexels for.
 *
 * Several words rather than one, deliberately. A bare "nature" returns a good
 * deal of *somebody hiking through* nature; "nature landscape scenery" returns
 * the landscape. The extra nouns are doing the work a `-people` operator would
 * do if the API had one.
 *
 * Untranslated, because these are query terms sent to an English-language search
 * index — the same rule that keeps `UTF-8` and `RFC 4648` out of the message
 * catalogue. The chip's *label* is translated; the term behind it is data.
 */
export const TOPIC_QUERIES: Record<BackdropTopic, string> = {
    nature: "nature landscape scenery",
    mountains: "mountain range valley landscape",
    forest: "forest trees woodland path",
    water: "lake river water reflection",
    beach: "beach sea coast shore",
    sky: "sky clouds sunset horizon",
    grass: "grass field meadow lawn",
    flowers: "flowers garden blossom plants",
    wildlife: "wildlife animal bird nature",
    interior: "empty room interior apartment wall",
    architecture: "architecture building facade exterior",
    city: "city street skyline buildings",
    artwork: "abstract painting art pattern",
    texture: "texture wall concrete surface",
};

/**
 * What the grid shows before anything is chosen.
 *
 * `nature` rather than a random pick: a value drawn from entropy at render time
 * is the hydration bug `docs/hydration-and-platform-pitfalls.md` opens with, and
 * a grid that shows something different on every reload is harder to come back
 * to, not more interesting.
 */
export const DEFAULT_BACKDROP_TOPIC: BackdropTopic = "nature";

/**
 * The term to send for a given chip and a given typed query.
 *
 * Typing wins over the chip, because somebody who has typed "library shelves"
 * has said what they want more precisely than any chip can. A blank query falls
 * back to the topic, and a blank topic falls back to the default — so this never
 * returns the empty string, and the people-free bias is never silently skipped
 * by a request that simply left both out.
 */
export function resolveSearchTerm(query: string, topic: BackdropTopic | undefined): string {
    const typed = query.trim();

    if (typed.length > 0) {
        return typed;
    }

    return TOPIC_QUERIES[topic ?? DEFAULT_BACKDROP_TOPIC];
}
