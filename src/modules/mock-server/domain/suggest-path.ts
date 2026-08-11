import { UPLOAD_FILE_KEYS } from "./request-body";
import type { DeclaredRequestShape, JsonValue, RequestSource } from "../types/graph";

/**
 * What can go in a path box, and how sure we are of each answer.
 *
 * The Response Builder and every logic node read parts of the request by path —
 * `avatar.contentType`, `user.address.city`, `game_id`. Typing one blind is the
 * single hardest thing to do in the studio, because nothing on screen says what
 * a request to this route actually contains. This is the list that says it.
 *
 * The whole design turns on one distinction: **some of these are facts about
 * the route and some are facts about traffic**, and conflating them would make
 * the picker lie.
 *
 * - A path parameter is *exact*. `/game/:game_id` names every parameter it has;
 *   there can be no others and none can be missing.
 * - A body or query key is *observed*. It came from requests that actually
 *   arrived, so it is true of those and says nothing about the next one. A
 *   route nobody has called yet has no observed anything, and the UI says so
 *   rather than showing an empty box that looks broken.
 * - A header may be either. What the logs saw is observed; the rest of the list
 *   is *common* — headers people condition on, offered because guessing
 *   `content-type` from memory is not the reader's job.
 * - The three properties of an upload are *ours*. `multipart/form-data` is
 *   parsed by this server into `{ filename, contentType, size }`, so after a dot
 *   those are known without having seen a single request.
 * - A *declared* name is what the document a route was imported from said it
 *   carries. It is neither of the two: not measured, like an observed key, and
 *   not guaranteed, like a path parameter — a claim about the contract, which
 *   may be out of date and which nothing here enforces. It is also the only
 *   kind available before the route has ever been called.
 *
 * `origin` carries that distinction to the UI, which labels each group. A
 * picker that presented a guess and a certainty identically would be worse than
 * no picker: it would teach people to trust the guesses.
 *
 * Pure and framework-free. The observed half is collected on the server from
 * request logs — see `actions/request-shape.ts` — because a log row holds
 * values as well as keys and only the keys have any business being here. The
 * declared half comes off the graph's own entry node, so it costs no round trip.
 */

export type JsonTypeName = "string" | "number" | "boolean" | "null" | "object" | "array";

export const SUGGESTION_ORIGINS = [
    "route",
    "graph",
    "declared",
    "observed",
    "upload",
    "common",
] as const;

export type SuggestionOrigin = (typeof SUGGESTION_ORIGINS)[number];

export type PathSuggestion = {
    readonly path: string;
    readonly origin: SuggestionOrigin;
    /** What was seen at this path. Absent where the source has no types. */
    readonly type?: JsonTypeName;
};

export type ObservedPath = {
    readonly path: string;
    readonly type: JsonTypeName;
};

/** What recent traffic to one route was carrying. Keys only, never values. */
export type ObservedShape = {
    readonly body: readonly ObservedPath[];
    readonly query: readonly string[];
    readonly headers: readonly string[];
    /** How many logged requests this was read from. Zero means "never called". */
    readonly samples: number;
};

export const EMPTY_OBSERVED_SHAPE: ObservedShape = {
    body: [],
    query: [],
    headers: [],
    samples: 0,
};

export type RequestFacts = {
    /** `:name` segments of the route being edited, plus `*` for a wildcard. */
    readonly params: readonly string[];
    readonly observed: ObservedShape;
    /**
     * What the document this route was imported from said it carries. Null for
     * a hand-built route, which is most of them.
     */
    readonly declared?: DeclaredRequestShape | null;
};

export const EMPTY_REQUEST_FACTS: RequestFacts = {
    params: [],
    observed: EMPTY_OBSERVED_SHAPE,
    declared: null,
};

/** Enough to fill a scrolling list; past this nobody is reading, they are typing. */
export const MAX_SUGGESTIONS = 40;

/** A body nests, and a picker is not a document viewer. */
const MAX_OBSERVED_DEPTH = 6;

/** A ceiling on one collection, so a pathological body cannot fill the list. */
const MAX_OBSERVED_PATHS = 250;

/**
 * Headers worth offering when the logs have not seen one.
 *
 * Lower-cased, because that is how the runtime hands them over and how a log row
 * shows them. `readStringMap` matches header names case-insensitively, so a
 * reader who prefers `Content-Type` is not punished for it — this is the
 * spelling that matches what they will see everywhere else in the tool.
 */
export const COMMON_REQUEST_HEADERS: readonly string[] = [
    "accept",
    "accept-encoding",
    "accept-language",
    "authorization",
    "cache-control",
    "content-length",
    "content-type",
    "cookie",
    "host",
    "if-match",
    "if-none-match",
    "origin",
    "range",
    "referer",
    "user-agent",
    "x-api-key",
    "x-correlation-id",
    "x-forwarded-for",
    "x-request-id",
];

/**
 * Exact before likely, and likely before merely possible.
 *
 * `route` and `graph` share a rank because both are read off the thing being
 * edited: the route's own parameters and the variables its own nodes set. There
 * is nothing to prefer between them and they never appear in the same list.
 */
const ORIGIN_RANK: Record<SuggestionOrigin, number> = {
    route: 0,
    graph: 0,
    declared: 1,
    observed: 2,
    upload: 3,
    common: 4,
};

export function jsonTypeName(value: JsonValue): JsonTypeName {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return "array";
    }

    const type = typeof value;

    return type === "object" || type === "string" || type === "number" || type === "boolean"
        ? type
        : "string";
}

/**
 * The characters `splitJsonPath` treats as structure rather than as a name.
 *
 * A key containing one of them cannot be written bare, and a key containing
 * *both* quote characters cannot be written at all — see `bracketKey`.
 */
const STRUCTURAL = /["'.[\]]/u;

/**
 * `a["odd.key"]` for a key the dotted form cannot reach.
 *
 * `null` when no spelling works. `splitJsonPath` resolves no escapes inside a
 * quoted section — deliberately, since a path is not a string literal — so a key
 * carrying both a single and a double quote is genuinely unreachable. Offering
 * a path that cannot be parsed back would be worse than leaving it out.
 */
function bracketKey(key: string): string | null {
    if (!key.includes('"')) {
        return `["${key}"]`;
    }

    return key.includes("'") ? null : `['${key}']`;
}

function joinPath(prefix: string, key: string): string | null {
    if (key !== "" && !STRUCTURAL.test(key)) {
        return prefix === "" ? key : `${prefix}.${key}`;
    }

    const bracketed = bracketKey(key);

    return bracketed === null ? null : `${prefix}${bracketed}`;
}

/**
 * Every path reachable inside one observed value.
 *
 * An array contributes its own path and then **index zero only**. Walking every
 * element would multiply the list by the array's length to say the same thing
 * each time — `items[0].id`, `items[1].id`, `items[2].id` are one fact — and the
 * reader who wants the third element can count. The array itself is still
 * offered, because `items` is what a length or emptiness check reads.
 */
export function collectObservedPaths(
    value: JsonValue,
    into: Map<string, JsonTypeName> = new Map(),
    prefix = "",
    depth = 0,
): Map<string, JsonTypeName> {
    if (depth > MAX_OBSERVED_DEPTH || into.size >= MAX_OBSERVED_PATHS) {
        return into;
    }

    if (Array.isArray(value)) {
        if (value.length > 0) {
            const child = `${prefix}[0]`;

            remember(into, child, value[0]);
            collectObservedPaths(value[0], into, child, depth + 1);
        }

        return into;
    }

    if (typeof value !== "object" || value === null) {
        return into;
    }

    for (const [key, child] of Object.entries(value)) {
        const path = joinPath(prefix, key);

        if (path === null || into.size >= MAX_OBSERVED_PATHS) {
            continue;
        }

        remember(into, path, child);
        collectObservedPaths(child, into, path, depth + 1);
    }

    return into;
}

/**
 * First type seen wins, and the descent happens either way.
 *
 * `mergeObservedPaths` walks samples newest first, so "first" means "most
 * recent" — a field that used to be `null` and is now a string reads as a
 * string. Descending regardless is what makes the merge a union: the newest
 * request may have sent `user: null` while an older one carried
 * `user.address.city`, and both facts are worth offering.
 */
function remember(into: Map<string, JsonTypeName>, path: string, value: JsonValue): void {
    if (!into.has(path)) {
        into.set(path, jsonTypeName(value));
    }
}

/**
 * The union of several observed bodies, newest first.
 *
 * First type seen wins, so a field that used to be `null` and is now a string
 * reads as a string. Union rather than intersection because an optional field is
 * still a field somebody may want to branch on, and a picker that hid anything
 * not present in every sample would go empty the first time a caller omitted
 * something.
 */
export function mergeObservedPaths(bodies: readonly JsonValue[]): readonly ObservedPath[] {
    const found = new Map<string, JsonTypeName>();

    for (const body of bodies) {
        collectObservedPaths(body, found);
    }

    return [...found.entries()]
        .map(([path, type]) => ({ path, type }))
        .toSorted((a, b) => a.path.localeCompare(b.path));
}

/**
 * The upload properties, offered the moment a dot is typed.
 *
 * Keyed off the text rather than off anything observed, because this is the one
 * shape the server decides: any multipart file part becomes exactly
 * `{ filename, contentType, size }`, whatever the field was called. That is what
 * makes `avatar.contentType` guessable on a route that has never been called.
 */
function uploadCandidates(typed: string): readonly PathSuggestion[] {
    const cut = typed.lastIndexOf(".");
    const prefix = typed.slice(0, cut);

    if (cut <= 0 || prefix.trim() === "") {
        return [];
    }

    return UPLOAD_FILE_KEYS.map((key) => ({
        path: `${prefix}.${key}`,
        origin: "upload" as const,
        type: key === "size" ? ("number" as const) : ("string" as const),
    }));
}

function named(names: readonly string[], origin: SuggestionOrigin): readonly PathSuggestion[] {
    return names.map((path) => ({ path, origin }));
}

/**
 * The body paths a declared example implies.
 *
 * The same walk the observed half uses, over a value that came from a schema
 * rather than from a request — which is the point: a route imported this
 * morning offers `payer` and `amount` before anybody has called it once.
 */
function declaredBodyPaths(declared: DeclaredRequestShape | null | undefined) {
    if (declared === null || declared === undefined || declared.body === null) {
        return [];
    }

    return [...collectObservedPaths(declared.body).entries()].map(([path, type]) => ({
        path,
        origin: "declared" as const,
        type,
    }));
}

function declaredNames(fields: readonly { readonly name: string }[] | undefined) {
    return named(
        (fields ?? []).map((field) => field.name),
        "declared",
    );
}

/** Everything on offer for one source, before the typed text narrows it. */
export function requestCandidates(
    source: RequestSource,
    typed: string,
    facts: RequestFacts,
): readonly PathSuggestion[] {
    switch (source) {
        case "param":
            return named(facts.params, "route");

        case "query":
            return dedupe([
                ...declaredNames(facts.declared?.query),
                ...named(facts.observed.query, "observed"),
            ]);

        // Folded, and only here: header names are case-insensitive to
        // `readStringMap`, so a document's `channelId` and a log row's
        // `channelid` are one header and must not be offered as two. Query keys
        // and body paths are case-*sensitive*, where folding would merge two
        // different fields into one wrong suggestion.
        case "header":
            return dedupe(
                [
                    ...declaredNames(facts.declared?.headers),
                    ...named(facts.observed.headers, "observed"),
                    ...named(COMMON_REQUEST_HEADERS, "common"),
                ],
                true,
            );

        case "body":
            return dedupe([
                ...declaredBodyPaths(facts.declared),
                ...facts.observed.body.map((entry) => ({
                    path: entry.path,
                    origin: "observed" as const,
                    type: entry.type,
                })),
                ...uploadCandidates(typed),
            ]);

        // Cookie names are never suggested, and the reason is in
        // `domain/log-record.ts`: the `cookie` header is redacted before a log
        // row is written, so there is nothing recorded to read them from. The
        // UI says that in words rather than showing an empty list.
        default:
            return [];
    }
}

/** First spelling wins, which is why the exact sources are listed first. */
function dedupe(all: readonly PathSuggestion[], fold = false): readonly PathSuggestion[] {
    const seen = new Set<string>();

    return all.filter((entry) => {
        const key = fold ? entry.path.toLowerCase() : entry.path;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);

        return true;
    });
}

/**
 * Narrows a candidate list to what was typed, and orders what survives.
 *
 * A prefix match outranks a match in the middle, because typing `avatar.` is a
 * statement about where you are in the tree and `user.avatar` is not an answer
 * to it. Substring matching is still offered underneath, since a reader who
 * remembers `city` and not `address` should not have to remember it.
 *
 * An exact hit is dropped: once the box already holds the whole path, a list
 * whose only row repeats it is noise sitting over the rest of the form.
 */
export function filterSuggestions(
    candidates: readonly PathSuggestion[],
    typed: string,
): readonly PathSuggestion[] {
    const needle = typed.trim().toLowerCase();

    const ranked = candidates.flatMap((entry) => {
        if (needle === "") {
            return [{ entry, match: 0 }];
        }

        const path = entry.path.toLowerCase();

        if (path === needle) {
            return [];
        }

        if (path.startsWith(needle)) {
            return [{ entry, match: 0 }];
        }

        return path.includes(needle) ? [{ entry, match: 1 }] : [];
    });

    return ranked
        .toSorted(
            (a, b) =>
                a.match - b.match ||
                ORIGIN_RANK[a.entry.origin] - ORIGIN_RANK[b.entry.origin] ||
                a.entry.path.length - b.entry.path.length ||
                a.entry.path.localeCompare(b.entry.path),
        )
        .slice(0, MAX_SUGGESTIONS)
        .map((row) => row.entry);
}

export function suggestRequestPaths(
    source: RequestSource,
    typed: string,
    facts: RequestFacts,
): readonly PathSuggestion[] {
    return filterSuggestions(requestCandidates(source, typed, facts), typed);
}

/** The same narrowing over a flat name list — environment keys, graph variables. */
export function suggestNames(
    names: readonly string[],
    typed: string,
    origin: SuggestionOrigin,
): readonly PathSuggestion[] {
    return filterSuggestions(named(names, origin), typed);
}
