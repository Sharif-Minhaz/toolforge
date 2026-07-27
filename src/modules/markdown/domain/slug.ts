/**
 * Everything that is not a letter, a mark, a digit, an underscore, a space or a
 * hyphen. `\p{M}` is the part that is easy to miss: Bengali writes its vowels as
 * combining marks, so dropping them turns "শুরু করা" into "শর-কর" — an anchor
 * that is not the heading it names.
 */
const NON_SLUG = /[^\p{L}\p{M}\p{N}_ \-]/gu;

const SPACES = /[\s-]+/g;

/** GitHub-style heading anchor: lowercased, punctuation dropped, spaces hyphenated. */
export function slugify(title: string): string {
    return title.normalize("NFKC").toLowerCase().replace(NON_SLUG, "").trim().replace(SPACES, "-");
}

/**
 * Hands out an anchor per heading, suffixing repeats the way GitHub does, so
 * two "Usage" sections still link to different places.
 *
 * Stateful on purpose — the caller owns one instance per parse, which keeps the
 * numbering deterministic for a given document instead of depending on how many
 * documents came before it.
 */
export function createSlugger(): (title: string) => string {
    const used = new Map<string, number>();

    return (title) => {
        const base = slugify(title) || "section";
        const seen = used.get(base) ?? 0;

        used.set(base, seen + 1);

        return seen === 0 ? base : `${base}-${seen}`;
    };
}
