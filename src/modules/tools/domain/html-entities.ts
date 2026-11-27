/**
 * Character references in markup somebody else wrote, turned back into text.
 *
 * Lifted out of the Domain Inspector when the Link Preview debugger needed the
 * same decoder for `og:title` and `og:description`. The table is wider than the
 * inspector ever needed for a `<title>`, because preview copy is where
 * publishers reach for typography: a headline written in a CMS arrives as
 * `It&rsquo;s here &mdash; finally`, and a debugger that rendered those
 * literally would be showing the reader a card no platform draws.
 *
 * Deliberately not the full HTML5 table of two thousand names. An unknown name
 * is left exactly as written — `&notareal;` stays `&notareal;` — so a miss is
 * visible rather than silently wrong, and the list below is the set that turns
 * up in real titles rather than a dependency's worth of Greek letters.
 */

const ENTITIES: Readonly<Record<string, string>> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    // Typography a CMS emits on its own.
    mdash: "—",
    ndash: "–",
    hellip: "…",
    lsquo: "‘",
    rsquo: "’",
    sbquo: "‚",
    ldquo: "“",
    rdquo: "”",
    bdquo: "„",
    laquo: "«",
    raquo: "»",
    lsaquo: "‹",
    rsaquo: "›",
    bull: "•",
    middot: "·",
    // Marks and currency that appear in brand names and prices.
    copy: "©",
    reg: "®",
    trade: "™",
    deg: "°",
    times: "×",
    euro: "€",
    pound: "£",
    yen: "¥",
    cent: "¢",
    sect: "§",
    para: "¶",
    zwj: "‍",
    zwnj: "‌",
};

export function decodeEntities(text: string): string {
    return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
        // Named references are case-sensitive in HTML (`&Eacute;` is not
        // `&eacute;`), but every name in this table is lower-case only and
        // publishers do write `&AMP;`, so the lookup folds case.
        const named = ENTITIES[name.toLowerCase()];

        if (named !== undefined) {
            return named;
        }

        const numeric = /^#x/i.test(name)
            ? Number.parseInt(name.slice(2), 16)
            : /^#/.test(name)
              ? Number.parseInt(name.slice(1), 10)
              : Number.NaN;

        // Surrogate halves are not characters; `String.fromCodePoint` accepts
        // them and produces a lone surrogate that renders as a replacement box.
        const isSurrogate = numeric >= 0xd800 && numeric <= 0xdfff;

        return Number.isInteger(numeric) && numeric > 0 && numeric <= 0x10ffff && !isSurrogate
            ? String.fromCodePoint(numeric)
            : whole;
    });
}
