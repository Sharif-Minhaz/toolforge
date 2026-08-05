import { MAX_PARAM_NAME_LENGTH, MAX_PATH_LENGTH, MAX_PATH_SEGMENTS } from "./constants";
import type { ParsedPathPattern, PathPatternResult, PathSegment } from "../types/routing";

/**
 * Reading a route pattern, and measuring it so matching never has to parse.
 *
 * `segmentCount`, `hasWildcard` and `specificity` are all computed here, at
 * write time, and stored on the row. A public request then selects candidates
 * with one indexed query and ranks them with integer comparison — no pattern is
 * parsed on the hot path.
 *
 * Matching is **case-sensitive**, because RFC 3986 paths are. `/Users` and
 * `/users` are two endpoints, which surprises some people and is the only
 * answer that does not quietly disagree with the server they are mocking.
 */

/** Unreserved plus the sub-delims a path segment may carry, per RFC 3986. */
const STATIC_SEGMENT = /^[A-Za-z0-9._~%!$&'()*+,;=:@-]+$/;

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The rank of each segment kind, and the base the specificity number is written
 * in. Static beats parameter beats wildcard, read left to right — so
 * `/users/me` wins over `/users/:id` for `/users/me`, and `/a/b/*` wins over
 * `/a/:b/:c` for `/a/b/c` because its static prefix runs further.
 */
const SEGMENT_RANK: Record<PathSegment["kind"], number> = {
    static: 2,
    param: 1,
    wildcard: 0,
};

const RANK_BASE = 3;

function readSegment(raw: string): PathSegment | null {
    if (raw === "*") {
        return { kind: "wildcard" };
    }

    if (raw.startsWith(":")) {
        const name = raw.slice(1);

        return PARAM_NAME.test(name) && name.length <= MAX_PARAM_NAME_LENGTH
            ? { kind: "param", name }
            : null;
    }

    return STATIC_SEGMENT.test(raw) ? { kind: "static", value: raw } : null;
}

/**
 * Right-padded with wildcards' zero, so patterns of different lengths compare
 * correctly — which they must, since a wildcard pattern is shorter than the
 * paths it matches. Without the padding `/a/b/c` and `/files/*` would be
 * compared as 26 against 6 for reasons of length rather than of specificity.
 */
export function computeSpecificity(segments: readonly PathSegment[]): number {
    let value = 0;

    for (let index = 0; index < MAX_PATH_SEGMENTS; index += 1) {
        const segment = segments[index];

        value = value * RANK_BASE + (segment === undefined ? 0 : SEGMENT_RANK[segment.kind]);
    }

    return value;
}

/**
 * Normalises and measures a pattern, or says why it cannot be one.
 *
 * Tolerant about the things people type — a missing leading slash, a trailing
 * one, doubled separators — and strict about everything that would make two
 * patterns ambiguous.
 */
export function parsePathPattern(input: string): PathPatternResult {
    const trimmed = input.trim();

    if (trimmed.length > MAX_PATH_LENGTH) {
        return { ok: false, reason: "too_long" };
    }

    /**
     * Named before the segment scan, because both would otherwise fall out of
     * it as `invalid_segment` — technically true and useless to read.
     *
     * A route pattern is the **path** and nothing else. Matching already
     * ignores the query (`splitRequestPath` cuts it off), so `/game` answers
     * `/game?id=7` and `/game?id=8` and `/game` alike, and `id` is read inside
     * the response as a request value. Accepting `/game?id=:game_id` would
     * therefore be worse than refusing it: the route would match every call to
     * `/game` regardless of the query, `:game_id` would never bind to anything,
     * and nothing would ever say why.
     *
     * A fragment is stronger still — the browser strips it before the request
     * leaves, so a pattern containing one describes something no server can
     * ever see.
     */
    if (trimmed.includes("?")) {
        return { ok: false, reason: "query_in_path" };
    }

    if (trimmed.includes("#")) {
        return { ok: false, reason: "fragment_in_path" };
    }

    if (trimmed === "" || trimmed === "/") {
        // The server root is a legitimate endpoint: `GET /` is what a health
        // check hits. It has no segments, so it matches only the empty path.
        return {
            ok: true,
            parsed: {
                pattern: "/",
                segments: [],
                segmentCount: 0,
                hasWildcard: false,
                specificity: computeSpecificity([]),
                paramNames: [],
            },
        };
    }

    // A doubled separator is a typo, never a meaningful empty segment.
    const raw = trimmed.replace(/\/+/gu, "/").replace(/^\//u, "").replace(/\/$/u, "");

    if (raw === "") {
        return { ok: false, reason: "empty_path" };
    }

    const parts = raw.split("/");

    if (parts.length > MAX_PATH_SEGMENTS) {
        return { ok: false, reason: "too_many_segments" };
    }

    const segments: PathSegment[] = [];
    const paramNames: string[] = [];

    for (const [index, part] of parts.entries()) {
        if (part === "") {
            return { ok: false, reason: "empty_segment" };
        }

        const segment = readSegment(part);

        if (segment === null) {
            return {
                ok: false,
                reason: part.startsWith(":") ? "invalid_param_name" : "invalid_segment",
            };
        }

        if (segment.kind === "wildcard" && index !== parts.length - 1) {
            // A wildcard in the middle would make the pattern ambiguous about
            // how many segments it swallowed, which makes parameter extraction
            // after it undecidable.
            return { ok: false, reason: "wildcard_not_last" };
        }

        if (segment.kind === "param") {
            if (paramNames.includes(segment.name)) {
                return { ok: false, reason: "duplicate_param" };
            }

            paramNames.push(segment.name);
        }

        segments.push(segment);
    }

    const hasWildcard = segments.at(-1)?.kind === "wildcard";

    return {
        ok: true,
        parsed: {
            pattern: `/${parts.join("/")}`,
            segments,
            segmentCount: segments.length,
            hasWildcard,
            specificity: computeSpecificity(segments),
            paramNames,
        },
    };
}

/**
 * The incoming path, reduced to the segments matching compares.
 *
 * Each segment is percent-decoded exactly once, so `%2F` stays a literal slash
 * inside one segment rather than splitting into two — decoding before splitting
 * is how a path traversal gets through a router that looks correct.
 */
export function splitRequestPath(path: string): readonly string[] {
    const withoutQuery = path.split("?")[0].split("#")[0];
    const trimmed = withoutQuery.replace(/\/+/gu, "/").replace(/^\//u, "").replace(/\/$/u, "");

    if (trimmed === "") {
        return [];
    }

    return trimmed.split("/").map(decodeSegment);
}

function decodeSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        // A lone `%` is not an escape and `decodeURIComponent` throws on it.
        // The literal text is a perfectly good thing to match against, and
        // failing the whole request over it would be a 400 nobody asked for.
        return segment;
    }
}

/** Renders a parsed pattern's parameters against a concrete path. */
export function extractParams(
    parsed: Pick<ParsedPathPattern, "segments">,
    requestSegments: readonly string[],
): Readonly<Record<string, string>> {
    const params: Record<string, string> = {};

    for (const [index, segment] of parsed.segments.entries()) {
        if (segment.kind === "param") {
            params[segment.name] = requestSegments[index] ?? "";
        }

        if (segment.kind === "wildcard") {
            // The tail, joined back up — `/files/*` against `/files/a/b` gives
            // `a/b` rather than only the first segment it swallowed.
            params["*"] = requestSegments.slice(index).join("/");
        }
    }

    return params;
}
