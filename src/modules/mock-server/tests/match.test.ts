import { describe, expect, test } from "bun:test";

import { matchEndpoint } from "@/modules/mock-server/domain/match";
import { parsePathPattern } from "@/modules/mock-server/domain/path-pattern";
import type { HttpMethod } from "@/modules/mock-server/types/graph";
import type { EndpointRoute } from "@/modules/mock-server/types/routing";

/**
 * Builds a route the way the repository does — measurements computed from the
 * pattern rather than hand-written, so a test can never assert against a
 * specificity the writer would not have stored.
 */
function route(id: string, method: HttpMethod, pattern: string): EndpointRoute {
    const result = parsePathPattern(pattern);

    if (!result.ok) {
        throw new Error(`bad fixture pattern ${pattern}: ${result.reason}`);
    }

    return {
        id,
        method,
        pattern: result.parsed.pattern,
        segmentCount: result.parsed.segmentCount,
        specificity: result.parsed.specificity,
        hasWildcard: result.parsed.hasWildcard,
    };
}

describe("matching a path", () => {
    test("finds an exact static route", () => {
        const routes = [route("a", "GET", "/health")];

        expect(matchEndpoint(routes, "GET", "/health")).toMatchObject({
            kind: "matched",
            endpointId: "a",
        });
    });

    test("finds the root", () => {
        expect(matchEndpoint([route("a", "GET", "/")], "GET", "/")).toMatchObject({
            kind: "matched",
            endpointId: "a",
        });
    });

    test("fills a parameter", () => {
        const routes = [route("a", "GET", "/users/:id")];

        expect(matchEndpoint(routes, "GET", "/users/42")).toMatchObject({
            kind: "matched",
            endpointId: "a",
            params: { id: "42" },
        });
    });

    test("misses when the segment count differs", () => {
        expect(matchEndpoint([route("a", "GET", "/users/:id")], "GET", "/users")).toEqual({
            kind: "not_found",
        });
    });

    test("ignores a trailing slash on the request", () => {
        expect(matchEndpoint([route("a", "GET", "/users")], "GET", "/users/")).toMatchObject({
            kind: "matched",
        });
    });

    test("ignores a query string on the request", () => {
        expect(matchEndpoint([route("a", "GET", "/users")], "GET", "/users?page=2")).toMatchObject({
            kind: "matched",
        });
    });

    test("is case-sensitive, as paths are", () => {
        expect(matchEndpoint([route("a", "GET", "/Users")], "GET", "/users")).toEqual({
            kind: "not_found",
        });
    });

    /** `/users//edit` is not `/users/:id/edit` with a blank id. */
    test("refuses to fill a parameter from an empty segment", () => {
        const routes = [route("a", "GET", "/users/:id/edit")];

        expect(matchEndpoint(routes, "GET", "/users//edit")).toEqual({ kind: "not_found" });
    });
});

describe("specificity ordering", () => {
    /** The single most-quoted example, and the one most routers get wrong. */
    test("a static segment beats a parameter", () => {
        const routes = [route("param", "GET", "/users/:id"), route("me", "GET", "/users/me")];

        expect(matchEndpoint(routes, "GET", "/users/me")).toMatchObject({ endpointId: "me" });
    });

    test("the same holds whichever order the rows arrive in", () => {
        const routes = [route("me", "GET", "/users/me"), route("param", "GET", "/users/:id")];

        expect(matchEndpoint(routes, "GET", "/users/me")).toMatchObject({ endpointId: "me" });
    });

    test("a parameter still answers anything the static one does not", () => {
        const routes = [route("param", "GET", "/users/:id"), route("me", "GET", "/users/me")];

        expect(matchEndpoint(routes, "GET", "/users/42")).toMatchObject({
            endpointId: "param",
            params: { id: "42" },
        });
    });

    test("a parameter beats a wildcard", () => {
        const routes = [route("wild", "GET", "/files/*"), route("named", "GET", "/files/:name")];

        expect(matchEndpoint(routes, "GET", "/files/report.pdf")).toMatchObject({
            endpointId: "named",
        });
    });

    test("a wildcard catches what nothing else does", () => {
        const routes = [route("wild", "GET", "/files/*"), route("named", "GET", "/files/:name")];

        expect(matchEndpoint(routes, "GET", "/files/2026/08/report.pdf")).toMatchObject({
            endpointId: "wild",
            params: { "*": "2026/08/report.pdf" },
        });
    });

    test("the longer static prefix wins", () => {
        const routes = [route("deep", "GET", "/a/b/*"), route("params", "GET", "/a/:b/:c")];

        expect(matchEndpoint(routes, "GET", "/a/b/c")).toMatchObject({ endpointId: "deep" });
    });

    /**
     * Two rows can carry identical specificity. Without a deterministic second
     * key the winner would depend on the order Postgres returned them, which
     * can differ between deploys and between replicas.
     */
    test("breaks a tie on the pattern text, not on row order", () => {
        const forwards = [route("x", "GET", "/a/:x"), route("y", "GET", "/a/:y")];
        const backwards = [route("y", "GET", "/a/:y"), route("x", "GET", "/a/:x")];

        expect(matchEndpoint(forwards, "GET", "/a/1")).toMatchObject({ endpointId: "x" });
        expect(matchEndpoint(backwards, "GET", "/a/1")).toMatchObject({ endpointId: "x" });
    });
});

describe("wildcards", () => {
    test("needs at least one segment to stand for", () => {
        expect(matchEndpoint([route("a", "GET", "/files/*")], "GET", "/files")).toEqual({
            kind: "not_found",
        });
    });

    test("matches one segment", () => {
        expect(matchEndpoint([route("a", "GET", "/files/*")], "GET", "/files/x")).toMatchObject({
            params: { "*": "x" },
        });
    });

    test("matches many", () => {
        expect(matchEndpoint([route("a", "GET", "/files/*")], "GET", "/files/x/y/z")).toMatchObject(
            { params: { "*": "x/y/z" } },
        );
    });
});

describe("method handling", () => {
    /**
     * The distinction most hosted mock servers fold away. A path that exists
     * under another method is a different fact from a path that does not exist,
     * and a client debugging an integration needs to tell them apart.
     */
    test("answers 405 when the path exists under another method", () => {
        const routes = [route("a", "GET", "/users")];

        expect(matchEndpoint(routes, "POST", "/users")).toMatchObject({
            kind: "method_not_allowed",
        });
    });

    test("answers 404 when the path does not exist at all", () => {
        expect(matchEndpoint([route("a", "GET", "/users")], "POST", "/orders")).toEqual({
            kind: "not_found",
        });
    });

    test("lists every method the path supports in Allow", () => {
        const routes = [route("a", "GET", "/users"), route("b", "POST", "/users")];
        const result = matchEndpoint(routes, "DELETE", "/users");

        expect(result).toMatchObject({ kind: "method_not_allowed" });
        expect(result.kind === "method_not_allowed" && result.allowed).toEqual([
            "GET",
            "HEAD",
            "OPTIONS",
            "POST",
        ]);
    });

    test("does not offer HEAD in Allow when there is no GET", () => {
        const routes = [route("a", "POST", "/users")];
        const result = matchEndpoint(routes, "DELETE", "/users");

        expect(result.kind === "method_not_allowed" && result.allowed).toEqual(["OPTIONS", "POST"]);
    });

    test("picks the right method when several share a path", () => {
        const routes = [route("get", "GET", "/users"), route("post", "POST", "/users")];

        expect(matchEndpoint(routes, "POST", "/users")).toMatchObject({ endpointId: "post" });
    });
});

describe("HEAD", () => {
    /** HTTP defines HEAD as GET without a body; making authors define both
     * would be two things to keep in step. */
    test("falls through to GET when no HEAD endpoint exists", () => {
        const routes = [route("get", "GET", "/users")];

        expect(matchEndpoint(routes, "HEAD", "/users")).toMatchObject({
            kind: "matched",
            endpointId: "get",
            bodyless: true,
        });
    });

    test("prefers an explicit HEAD endpoint over the GET", () => {
        const routes = [route("get", "GET", "/users"), route("head", "HEAD", "/users")];

        expect(matchEndpoint(routes, "HEAD", "/users")).toMatchObject({ endpointId: "head" });
    });

    test("still marks an explicit HEAD as bodyless", () => {
        const routes = [route("head", "HEAD", "/users")];

        expect(matchEndpoint(routes, "HEAD", "/users")).toMatchObject({ bodyless: true });
    });

    test("a GET is never bodyless", () => {
        expect(matchEndpoint([route("get", "GET", "/u")], "GET", "/u")).toMatchObject({
            bodyless: false,
        });
    });

    test("404s when the path does not exist under GET either", () => {
        expect(matchEndpoint([route("p", "POST", "/u")], "HEAD", "/u")).toMatchObject({
            kind: "method_not_allowed",
        });
    });
});

describe("OPTIONS", () => {
    /** An undefined OPTIONS is a preflight, so it is answered rather than refused. */
    test("is answered from what the path supports", () => {
        const routes = [route("get", "GET", "/users"), route("post", "POST", "/users")];
        const result = matchEndpoint(routes, "OPTIONS", "/users");

        expect(result).toMatchObject({ kind: "options" });
        expect(result.kind === "options" && result.allowed).toEqual([
            "GET",
            "HEAD",
            "OPTIONS",
            "POST",
        ]);
    });

    test("an explicit OPTIONS endpoint wins over the automatic answer", () => {
        const routes = [route("opt", "OPTIONS", "/users"), route("get", "GET", "/users")];

        expect(matchEndpoint(routes, "OPTIONS", "/users")).toMatchObject({
            kind: "matched",
            endpointId: "opt",
        });
    });

    test("still 404s for a path that does not exist", () => {
        expect(matchEndpoint([route("g", "GET", "/u")], "OPTIONS", "/nope")).toEqual({
            kind: "not_found",
        });
    });
});

describe("degradation", () => {
    test("an empty server matches nothing", () => {
        expect(matchEndpoint([], "GET", "/anything")).toEqual({ kind: "not_found" });
    });

    /** One unreadable row must not take a whole server's routing down. */
    test("skips a stored pattern that no longer parses", () => {
        const broken: EndpointRoute = {
            id: "broken",
            method: "GET",
            pattern: "/files/*/meta",
            segmentCount: 3,
            specificity: 0,
            hasWildcard: true,
        };

        expect(
            matchEndpoint([broken, route("ok", "GET", "/health")], "GET", "/health"),
        ).toMatchObject({ endpointId: "ok" });
    });
});
