/**
 * Turning the keys of a `db.json` into the names of a GraphQL schema.
 *
 * This is a harder problem here than the same-shaped one in the JSON Server
 * Studio, and the difference is worth stating because it is the reason this file
 * exists rather than a call into that one.
 *
 * `json-server/domain/query.ts` also singularises, and its own comment says the
 * inflector is deliberately naive: `_embed` only ever has to relate two names
 * the same document already contains, so a wrong guess costs one embed that
 * comes back empty. **Here a wrong guess is a published type name.** It goes
 * into the SDL, into every introspection response, into whatever `graphql-codegen`
 * writes, and into the source of everyone who consumed the API before it was
 * noticed. `people` becoming `Peopl` is not a missing feature, it is a wrong
 * contract. So this inflector carries the irregulars, and — because no inflector
 * is ever complete — **the studio prints the derived name beside every
 * resource**, so a guess it got wrong is visible before anybody depends on it
 * rather than after.
 *
 * The second job here is repair. `RESOURCE_NAME_PATTERN` admits `-`, because a
 * hyphen is perfectly good in a URL path; GraphQL's `Name` grammar does not
 * admit one at all. That mismatch cannot be wished away, so it is repaired
 * explicitly and reported, never silently.
 */

/** GraphQL's own `Name` grammar, from the specification. */
const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/u;

/**
 * Plurals whose singular no suffix rule reaches.
 *
 * Short on purpose. Every entry is a word that actually turns up as a collection
 * name in a fixture — `users`, `people`, `categories` — rather than an attempt at
 * the whole of English, which is a dictionary and not a domain module.
 */
const IRREGULAR_SINGULARS: ReadonlyMap<string, string> = new Map([
    ["people", "person"],
    ["children", "child"],
    ["men", "man"],
    ["women", "woman"],
    ["teeth", "tooth"],
    ["feet", "foot"],
    ["mice", "mouse"],
    ["geese", "goose"],
    ["oxen", "ox"],
    ["indices", "index"],
    ["matrices", "matrix"],
    ["vertices", "vertex"],
    ["appendices", "appendix"],
    ["criteria", "criterion"],
    ["phenomena", "phenomenon"],
    ["movies", "movie"],
    ["lives", "life"],
    ["knives", "knife"],
    ["leaves", "leaf"],
    ["wolves", "wolf"],
    ["halves", "half"],
    ["shelves", "shelf"],
    ["selves", "self"],
    ["quizzes", "quiz"],
]);

/**
 * Words that are already singular, or have no singular worth having.
 *
 * Without this, `series` becomes `serie` and `status` becomes `statu` — both
 * from the harmless-looking "drop a trailing s" rule, and both wrong in a way
 * that survives into the published schema.
 */
const UNCOUNTABLE: ReadonlySet<string> = new Set([
    "series",
    "species",
    "news",
    "media",
    "data",
    "metadata",
    "info",
    "equipment",
    "information",
    "staff",
    "sheep",
    "fish",
    "aircraft",
    "deer",
    "feedback",
    "analytics",
    "status",
    "bus",
    "gas",
    "lens",
    "campus",
    "alias",
    "atlas",
]);

/**
 * The singular of a collection name.
 *
 * Case-insensitive on the way in and case-preserving on the way out, so
 * `Categories` and `categories` both resolve and neither is rewritten. The rules
 * run irregulars first, then the suffix shapes, then the default — which is the
 * only order in which `wolves` reaches its irregular before the `ves` rule
 * turns it into `wolf` by luck and `movies` into `movy` by accident.
 */
export function singularize(name: string): string {
    const lower = name.toLowerCase();

    if (UNCOUNTABLE.has(lower)) {
        return name;
    }

    const irregular = IRREGULAR_SINGULARS.get(lower);

    if (irregular !== undefined) {
        return matchCase(name, irregular);
    }

    // `categories` → `category`, but only where a consonant precedes, because
    // `-ies` after a vowel comes from a singular ending in `-ie` (`movies`,
    // `zombies`) which the irregular table above carries instead.
    if (/[^aeiou]ies$/iu.test(name) && name.length > 3) {
        return `${name.slice(0, -3)}${matchCase(name.slice(-1), "y")}`;
    }

    // `addresses`, `boxes`, `batches`, `dishes`, `quizzes` — the sibilant
    // plurals, which take `es` rather than `s`.
    if (/(?:s|x|z|ch|sh)es$/iu.test(name)) {
        return name.slice(0, -2);
    }

    // `ss` is not a plural marker: `address` and `class` keep their tail.
    return /s$/iu.test(name) && !/ss$/iu.test(name) ? name.slice(0, -1) : name;
}

/**
 * The plural of a singular name, for finding the collection a relation points at.
 *
 * The inverse is not needed to be perfect, only *consistent with* `singularize`
 * — a name whose round trip does not return where it started simply fails to
 * match a collection, and the relation is not derived. That is the correct
 * failure: an absent field, never a wrong one.
 */
export function pluralize(name: string): string {
    const lower = name.toLowerCase();

    if (UNCOUNTABLE.has(lower)) {
        return name;
    }

    for (const [plural, singular] of IRREGULAR_SINGULARS) {
        if (singular === lower) {
            return matchCase(name, plural);
        }
    }

    if (/[^aeiou]y$/iu.test(name)) {
        return `${name.slice(0, -1)}${matchCase(name.slice(-1), "ies")}`;
    }

    return /(?:s|x|z|ch|sh)$/iu.test(name)
        ? `${name}${matchCase(name, "es")}`
        : `${name}${matchCase(name, "s")}`;
}

/**
 * Copies the casing of `source` onto `replacement`.
 *
 * Only two cases are honoured — all upper, and everything else — because those
 * are the two that appear: `POSTS` and `posts`. A mixed-case key keeps its own
 * body and only the appended tail follows, which is what leaves `blogPosts`
 * alone.
 */
function matchCase(source: string, replacement: string): string {
    return source === source.toUpperCase() && source !== source.toLowerCase()
        ? replacement.toUpperCase()
        : replacement;
}

/**
 * A resource key, repaired into something GraphQL will accept as a field name.
 *
 * Two repairs and no more, because every further "improvement" is a place the
 * published schema stops matching the document somebody wrote:
 *
 * - **A hyphen becomes a camel hump.** `blog-posts` → `blogPosts`. GraphQL has
 *   no hyphen in its `Name` grammar at all, so this is a repair rather than a
 *   preference.
 * - **A leading digit gains an underscore.** `2024` → `_2024`. A GraphQL name
 *   may not start with a digit; a `db.json` key very much may.
 *
 * Underscores are left exactly as they are. `blog_posts` is a valid GraphQL
 * field name, and camel-casing it would be this tool deciding it knows better
 * than the person who named the key.
 *
 * Returns `null` only when nothing usable is left — an empty key, or one whose
 * every character was stripped.
 */
export function toFieldName(resource: string): string | null {
    const camel = resource.replace(/-+([A-Za-z0-9])/gu, (_match, next: string) =>
        next.toUpperCase(),
    );
    const stripped = camel.replace(/[^_0-9A-Za-z]/gu, "");

    if (stripped.length === 0) {
        return null;
    }

    const named = /^[0-9]/u.test(stripped) ? `_${stripped}` : stripped;

    // Reserved by the specification for introspection. Not reachable from a
    // routable key — `RESOURCE_NAME_PATTERN` requires the first character to be
    // alphanumeric — but checked anyway, because this function is the only
    // thing standing between a document and the schema.
    return GRAPHQL_NAME.test(named) && !named.startsWith("__") ? named : null;
}

/**
 * The type name for a collection: PascalCase, singular.
 *
 * PascalCase is not decoration. Every GraphQL schema anyone has read spells its
 * types that way, so a lowercase `post` type reads as a bug in the generator to
 * every developer who opens the SDL — and the tools around GraphQL, codegen
 * especially, assume it when they derive file and interface names.
 */
export function toTypeName(resource: string): string | null {
    const field = toFieldName(resource);

    if (field === null) {
        return null;
    }

    return pascalCase(singularize(field));
}

/** `blog_posts` → `BlogPosts`; `blogPosts` → `BlogPosts`; `_2024` → `_2024`. */
function pascalCase(name: string): string {
    const parts = name.split("_").filter((part) => part.length > 0);

    if (parts.length === 0) {
        // An all-underscore name. Nothing to capitalise; kept so the caller's
        // uniqueness pass still has a string to work with.
        return name;
    }

    const joined = parts
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(name.includes("_") ? "" : "");

    // A leading underscore is meaningful — it is what a numeric key was given —
    // so it survives the capitalisation.
    return name.startsWith("_") ? `_${joined}` : joined;
}

/**
 * Makes a name unique against everything already taken, deterministically.
 *
 * Collisions are real rather than theoretical: `blog-posts` and `blogPosts` are
 * two different `db.json` keys that repair to one field name, and `posts` and
 * `post` are two collections whose types are both `Post`. Suffixing with `2`,
 * `3`, … is not pretty, and that is the point — it is *visible*, and the studio
 * prints it beside the resource it belongs to, so the fix (rename the key) is
 * obvious. The alternative, dropping one of the two, loses a resource silently.
 *
 * Deterministic because the caller iterates the document's keys in order, so the
 * same document always produces the same schema — which is what makes an SDL
 * worth checking into somebody's repository.
 */
export function uniqueName(wanted: string, taken: ReadonlySet<string>): string {
    if (!taken.has(wanted)) {
        return wanted;
    }

    let suffix = 2;

    while (taken.has(`${wanted}${suffix}`)) {
        suffix += 1;
    }

    return `${wanted}${suffix}`;
}

/** Whether a record field can be published under its own name. */
export function isPublishableFieldName(key: string): boolean {
    return GRAPHQL_NAME.test(key) && !key.startsWith("__");
}
