import { extractParams, parsePathPattern, splitRequestPath } from "./path-pattern";
import type { HttpMethod } from "../types/graph";
import type { EndpointRoute, RouteResult } from "../types/routing";

/**
 * Which endpoint answers a request, and what to say when none does.
 *
 * Pure and total: it is handed every enabled route in one server plus the
 * incoming method and path, and returns one of four conclusions. The candidate
 * list is already narrowed by the query in `repository/execute.ts`; narrowing it
 * further here would only duplicate the index.
 *
 * The part most hosted mock servers get wrong is the third and fourth answers.
 * A path that exists under a different method is **405 with an `Allow` header**,
 * not 404 — the two are different facts and a client debugging an integration
 * needs to tell them apart. And an `OPTIONS` nobody defined is a preflight, so
 * it is answered from what the path does support rather than refused.
 */

type Candidate = {
    readonly route: EndpointRoute;
    readonly params: Readonly<Record<string, string>>;
};

function matchesPath(route: EndpointRoute, segments: readonly string[]): Candidate | null {
    const parsed = parsePathPattern(route.pattern);

    if (!parsed.ok) {
        // A stored pattern that no longer parses cannot match anything. It is
        // skipped rather than thrown over: one bad row must not take a whole
        // server's routing down with it.
        return null;
    }

    const { segments: patternSegments } = parsed.parsed;
    const last = patternSegments.at(-1);
    const isWildcard = last?.kind === "wildcard";

    if (isWildcard) {
        // The wildcard needs at least one segment to stand for, so a pattern of
        // n segments needs at least n from the request.
        if (segments.length < patternSegments.length) {
            return null;
        }
    } else if (segments.length !== patternSegments.length) {
        return null;
    }

    for (const [index, segment] of patternSegments.entries()) {
        if (segment.kind === "static" && segments[index] !== segment.value) {
            return null;
        }

        if (segment.kind === "param" && (segments[index] ?? "") === "") {
            // An empty segment cannot fill a parameter; `/users//edit` is not
            // `/users/:id/edit` with a blank id.
            return null;
        }
    }

    return { route, params: extractParams(parsed.parsed, segments) };
}

/**
 * Highest specificity first, then the pattern text ascending.
 *
 * The tie-break is not cosmetic. Two rows can carry the same specificity —
 * `/a/:x` and `/a/:y` differ only in a name — and without a deterministic
 * second key the winner would depend on the order Postgres happened to return
 * them, which can change between deploys and between replicas.
 */
function bestOf(candidates: readonly Candidate[]): Candidate {
    return candidates.reduce((best, candidate) => {
        if (candidate.route.specificity !== best.route.specificity) {
            return candidate.route.specificity > best.route.specificity ? candidate : best;
        }

        return candidate.route.pattern < best.route.pattern ? candidate : best;
    });
}

function allowedMethods(candidates: readonly Candidate[]): readonly HttpMethod[] {
    const methods = new Set(candidates.map((candidate) => candidate.route.method));

    // A defined GET answers HEAD too, so it belongs in `Allow` even when no
    // HEAD endpoint exists.
    if (methods.has("GET")) {
        methods.add("HEAD");
    }

    methods.add("OPTIONS");

    return [...methods].toSorted();
}

export function matchEndpoint(
    routes: readonly EndpointRoute[],
    method: HttpMethod,
    path: string,
): RouteResult {
    const segments = splitRequestPath(path);

    const onPath = routes
        .map((route) => matchesPath(route, segments))
        .filter((candidate): candidate is Candidate => candidate !== null);

    if (onPath.length === 0) {
        return { kind: "not_found" };
    }

    const exact = onPath.filter((candidate) => candidate.route.method === method);

    if (exact.length > 0) {
        const winner = bestOf(exact);

        return {
            kind: "matched",
            endpointId: winner.route.id,
            params: winner.params,
            bodyless: method === "HEAD",
        };
    }

    // HTTP requires HEAD to behave exactly as GET does, minus the body. Making
    // authors define both would be a chore that produces two things to keep in
    // step, so an undefined HEAD falls through to GET.
    if (method === "HEAD") {
        const viaGet = onPath.filter((candidate) => candidate.route.method === "GET");

        if (viaGet.length > 0) {
            const winner = bestOf(viaGet);

            return {
                kind: "matched",
                endpointId: winner.route.id,
                params: winner.params,
                bodyless: true,
            };
        }
    }

    if (method === "OPTIONS") {
        return { kind: "options", allowed: allowedMethods(onPath) };
    }

    return { kind: "method_not_allowed", allowed: allowedMethods(onPath) };
}
