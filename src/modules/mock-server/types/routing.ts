import type { HttpMethod } from "./graph";

/**
 * The route half of a mock server: how a stored pattern is described, and what
 * matching an incoming path against a server's patterns can conclude.
 *
 * See `docs/mock-server-studio.md` §4.2. The part worth remembering is that
 * matching answers three things, not two — a path that exists under a different
 * method is a 405 and not a 404, and folding those together is the most common
 * defect in hosted mock servers.
 */

export type PathSegmentKind = "static" | "param" | "wildcard";

export type PathSegment =
    | { readonly kind: "static"; readonly value: string }
    | { readonly kind: "param"; readonly name: string }
    | { readonly kind: "wildcard" };

/** A pattern, parsed and measured, ready to be stored or matched. */
export type ParsedPathPattern = {
    /** The canonical spelling: leading slash, no trailing slash. */
    readonly pattern: string;
    readonly segments: readonly PathSegment[];
    readonly segmentCount: number;
    readonly hasWildcard: boolean;
    /**
     * Base-3, read left to right, one digit per segment — 2 static, 1
     * parameter, 0 wildcard — right-padded to `MAX_PATH_SEGMENTS`. Higher wins.
     * Padding is what lets patterns of different lengths be compared, which
     * happens whenever a wildcard is in play.
     */
    readonly specificity: number;
    readonly paramNames: readonly string[];
};

export const PATH_PATTERN_PROBLEMS = [
    "empty_path",
    "too_long",
    "too_many_segments",
    "invalid_segment",
    "empty_segment",
    "invalid_param_name",
    "duplicate_param",
    "wildcard_not_last",
    /**
     * `/game?id=:game_id` — the commonest thing to get wrong here, and the one
     * a generic "not a usable path" leaves somebody stuck on. It is named
     * separately so the copy can say the useful thing: a route matches the path
     * alone, the query is read inside the response.
     */
    "query_in_path",
    /**
     * A fragment is stripped by the browser and never sent, so a route
     * containing one could not match even if this accepted it.
     */
    "fragment_in_path",
] as const;

export type PathPatternProblem = (typeof PATH_PATTERN_PROBLEMS)[number];

export type PathPatternResult =
    | { readonly ok: true; readonly parsed: ParsedPathPattern }
    | { readonly ok: false; readonly reason: PathPatternProblem };

/**
 * The stored shape matching reads. Deliberately not the whole `Endpoint` row —
 * a candidate query must not pull `graph`, and typing the candidate as
 * something narrower than the row is what stops that happening by accident.
 */
export type EndpointRoute = {
    readonly id: string;
    readonly method: HttpMethod;
    readonly pattern: string;
    readonly segmentCount: number;
    readonly specificity: number;
    readonly hasWildcard: boolean;
};

export type RouteMatch = {
    readonly kind: "matched";
    readonly endpointId: string;
    readonly params: Readonly<Record<string, string>>;
    /** Set when a HEAD request was answered by the GET endpoint. */
    readonly bodyless: boolean;
};

export type RouteMiss =
    | { readonly kind: "not_found" }
    /** The path exists; this method does not. Carries the `Allow` header. */
    | { readonly kind: "method_not_allowed"; readonly allowed: readonly HttpMethod[] }
    /** An `OPTIONS` nobody defined, answered from what the path does support. */
    | { readonly kind: "options"; readonly allowed: readonly HttpMethod[] };

export type RouteResult = RouteMatch | RouteMiss;

export const SERVER_KEY_PROBLEMS = [
    "empty_key",
    "too_short",
    "too_long",
    "invalid_characters",
    "edge_hyphen",
    "double_hyphen",
    "reserved",
] as const;

export type ServerKeyProblem = (typeof SERVER_KEY_PROBLEMS)[number];

export type ServerKeyResult =
    | { readonly ok: true; readonly key: string }
    | { readonly ok: false; readonly reason: ServerKeyProblem };
