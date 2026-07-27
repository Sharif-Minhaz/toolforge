/**
 * Named references worth resolving in a preview. The full HTML set runs to
 * 2,231 entries and would be more bytes than the parser; this is the slice that
 * actually turns up in prose, plus the five XML ones a document cannot do
 * without. Anything else is left exactly as typed, which is honest — an
 * unresolved `&frac34;` is easier to debug than a silently dropped one.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    copy: "©",
    reg: "®",
    trade: "™",
    hellip: "…",
    mdash: "—",
    ndash: "–",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    laquo: "«",
    raquo: "»",
    deg: "°",
    plusmn: "±",
    times: "×",
    divide: "÷",
    micro: "µ",
    para: "¶",
    sect: "§",
    dagger: "†",
    bull: "•",
    middot: "·",
    larr: "←",
    uarr: "↑",
    rarr: "→",
    darr: "↓",
    harr: "↔",
    rArr: "⇒",
    hArr: "⇔",
    ne: "≠",
    le: "≤",
    ge: "≥",
    infin: "∞",
    sum: "∑",
    prod: "∏",
    radic: "√",
    check: "✓",
    cross: "✗",
    star: "☆",
    hearts: "♥",
    euro: "€",
    pound: "£",
    yen: "¥",
    cent: "¢",
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    pi: "π",
    sigma: "σ",
    omega: "ω",
    Omega: "Ω",
};

const REFERENCE = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** Surrogate halves and out-of-range code points are not text; leave them alone. */
function fromCodePoint(code: number): string | null {
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
        return null;
    }

    if (code >= 0xd800 && code <= 0xdfff) {
        return null;
    }

    return String.fromCodePoint(code);
}

/**
 * Resolves the character references markdown passes through untouched.
 *
 * Safe to run on author text because the result is rendered as a React text
 * node: `&lt;script&gt;` becomes the four visible characters `<scr…`, never an
 * element. Decoding is what makes it *visible* — without it the preview shows
 * the reference rather than the character it stands for.
 */
export function decodeHtmlEntities(text: string): string {
    if (!text.includes("&")) {
        return text;
    }

    return text.replace(REFERENCE, (reference, body: string) => {
        if (body.startsWith("#")) {
            const hex = body[1] === "x" || body[1] === "X";
            const digits = hex ? body.slice(2) : body.slice(1);
            const code = Number.parseInt(digits, hex ? 16 : 10);

            return fromCodePoint(code) ?? reference;
        }

        return NAMED_ENTITIES[body] ?? reference;
    });
}
