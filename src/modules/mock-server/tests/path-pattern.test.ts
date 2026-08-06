import { describe, expect, test } from "bun:test";

import { MAX_PATH_SEGMENTS } from "@/modules/mock-server/domain/constants";
import {
    computeSpecificity,
    extractParams,
    parseMockPath,
    parsePathPattern,
    splitRequestPath,
} from "@/modules/mock-server/domain/path-pattern";

function parsed(pattern: string) {
    const result = parsePathPattern(pattern);

    if (!result.ok) {
        throw new Error(`expected ${pattern} to parse, got ${result.reason}`);
    }

    return result.parsed;
}

describe("parsePathPattern — normalisation", () => {
    test("adds the leading slash somebody left off", () => {
        expect(parsed("users").pattern).toBe("/users");
    });

    test("drops a trailing slash", () => {
        expect(parsed("/users/").pattern).toBe("/users");
    });

    test("collapses doubled separators", () => {
        expect(parsed("/users//:id").pattern).toBe("/users/:id");
    });

    test("trims surrounding whitespace", () => {
        expect(parsed("  /users/:id  ").pattern).toBe("/users/:id");
    });

    /** `GET /` is what a health check hits, so the root is a real endpoint. */
    test("treats the bare root as a pattern with no segments", () => {
        expect(parsed("/")).toMatchObject({ pattern: "/", segmentCount: 0, hasWildcard: false });
    });

    test("treats the empty string as the root", () => {
        expect(parsed("").pattern).toBe("/");
    });

    test("keeps case, because RFC 3986 paths are case-sensitive", () => {
        expect(parsed("/Users/:id").pattern).toBe("/Users/:id");
    });
});

describe("parsePathPattern — measurement", () => {
    test("counts segments", () => {
        expect(parsed("/a/b/c").segmentCount).toBe(3);
    });

    test("names every parameter in order", () => {
        expect(parsed("/orgs/:org/repos/:repo").paramNames).toEqual(["org", "repo"]);
    });

    test("flags a trailing wildcard", () => {
        expect(parsed("/files/*").hasWildcard).toBe(true);
    });

    test("does not flag a pattern with no wildcard", () => {
        expect(parsed("/files/:name").hasWildcard).toBe(false);
    });
});

describe("parsePathPattern — refusals", () => {
    test("refuses a path past the segment ceiling", () => {
        const long = `/${Array.from({ length: MAX_PATH_SEGMENTS + 1 }, (_, i) => `s${i}`).join("/")}`;

        expect(parsePathPattern(long)).toEqual({ ok: false, reason: "too_many_segments" });
    });

    test("accepts a path exactly at the ceiling", () => {
        const atLimit = `/${Array.from({ length: MAX_PATH_SEGMENTS }, (_, i) => `s${i}`).join("/")}`;

        expect(parsePathPattern(atLimit).ok).toBe(true);
    });

    test("refuses a very long path", () => {
        expect(parsePathPattern(`/${"a".repeat(600)}`)).toEqual({ ok: false, reason: "too_long" });
    });

    /**
     * A wildcard in the middle makes it undecidable how many segments it
     * swallowed, so every parameter after it would be ambiguous.
     */
    test("refuses a wildcard that is not last", () => {
        expect(parsePathPattern("/files/*/meta")).toEqual({
            ok: false,
            reason: "wildcard_not_last",
        });
    });

    test("refuses two parameters of the same name", () => {
        expect(parsePathPattern("/a/:id/b/:id")).toEqual({ ok: false, reason: "duplicate_param" });
    });

    test("refuses a parameter with no name", () => {
        expect(parsePathPattern("/a/:")).toEqual({ ok: false, reason: "invalid_param_name" });
    });

    test("refuses a parameter name starting with a digit", () => {
        expect(parsePathPattern("/a/:1id")).toEqual({ ok: false, reason: "invalid_param_name" });
    });

    test("refuses a segment carrying a space", () => {
        expect(parsePathPattern("/a b")).toEqual({ ok: false, reason: "invalid_segment" });
    });

    /**
     * Still refused — but by its own name rather than as a bad segment. The
     * reason changed deliberately: `invalid_segment` is accurate and useless,
     * and this is the mistake people actually make. See the query-string block
     * at the foot of this file.
     */
    test("refuses a segment carrying a query separator", () => {
        expect(parsePathPattern("/a?b")).toEqual({ ok: false, reason: "query_in_path" });
    });
});

describe("computeSpecificity", () => {
    test("ranks static above parameter at the same position", () => {
        expect(parsed("/users/me").specificity).toBeGreaterThan(parsed("/users/:id").specificity);
    });

    test("ranks parameter above wildcard at the same position", () => {
        expect(parsed("/files/:name").specificity).toBeGreaterThan(parsed("/files/*").specificity);
    });

    /**
     * Read left to right, so a longer static prefix wins even when the loser
     * has more static segments overall.
     */
    test("prefers the pattern whose static prefix runs further", () => {
        expect(parsed("/a/b/*").specificity).toBeGreaterThan(parsed("/a/:b/:c").specificity);
    });

    /**
     * The padding is what makes patterns of different lengths comparable, which
     * they must be — a wildcard pattern is always shorter than what it matches.
     */
    test("ranks a longer static path above a shorter wildcard one", () => {
        expect(parsed("/files/a/b").specificity).toBeGreaterThan(parsed("/files/*").specificity);
    });

    test("gives identical shapes identical scores", () => {
        expect(parsed("/a/:x").specificity).toBe(parsed("/a/:y").specificity);
    });

    test("scores the root lowest of all", () => {
        expect(computeSpecificity([])).toBe(0);
    });

    /** `specificity` is stored in a Postgres `INTEGER`, so it must fit in one. */
    test("stays inside a signed 32-bit integer at maximum length", () => {
        const widest = `/${Array.from({ length: MAX_PATH_SEGMENTS }, (_, i) => `s${i}`).join("/")}`;

        expect(parsed(widest).specificity).toBeLessThan(2 ** 31 - 1);
    });
});

describe("splitRequestPath", () => {
    test("splits an ordinary path", () => {
        expect(splitRequestPath("/users/42")).toEqual(["users", "42"]);
    });

    test("reads the root as no segments", () => {
        expect(splitRequestPath("/")).toEqual([]);
    });

    test("ignores a query string", () => {
        expect(splitRequestPath("/users/42?tab=repos")).toEqual(["users", "42"]);
    });

    test("ignores a fragment", () => {
        expect(splitRequestPath("/users/42#top")).toEqual(["users", "42"]);
    });

    test("ignores a trailing slash", () => {
        expect(splitRequestPath("/users/42/")).toEqual(["users", "42"]);
    });

    /**
     * Decoded once, and after splitting. Decoding first would turn `%2F` into a
     * separator and split one segment into two, which is how a traversal gets
     * through a router that looks correct.
     */
    test("decodes each segment exactly once, after splitting", () => {
        expect(splitRequestPath("/files/a%2Fb")).toEqual(["files", "a/b"]);
    });

    test("decodes ordinary escapes", () => {
        expect(splitRequestPath("/search/hello%20world")).toEqual(["search", "hello world"]);
    });

    /** A lone `%` makes `decodeURIComponent` throw; the literal still matches. */
    test("survives a malformed escape rather than failing the request", () => {
        expect(splitRequestPath("/a/100%")).toEqual(["a", "100%"]);
    });
});

describe("extractParams", () => {
    test("names a single parameter", () => {
        expect(extractParams(parsed("/users/:id"), ["users", "42"])).toEqual({ id: "42" });
    });

    test("names several", () => {
        expect(
            extractParams(parsed("/orgs/:org/repos/:repo"), ["orgs", "acme", "repos", "site"]),
        ).toEqual({ org: "acme", repo: "site" });
    });

    test("returns nothing for a fully static pattern", () => {
        expect(extractParams(parsed("/health"), ["health"])).toEqual({});
    });

    /** The tail joined back up, not only the first segment it swallowed. */
    test("gives a wildcard the whole remaining path", () => {
        expect(extractParams(parsed("/files/*"), ["files", "a", "b", "c"])).toEqual({
            "*": "a/b/c",
        });
    });

    test("carries parameters alongside a wildcard", () => {
        expect(extractParams(parsed("/u/:id/files/*"), ["u", "7", "files", "x", "y"])).toEqual({
            id: "7",
            "*": "x/y",
        });
    });
});

describe("a query string in a route pattern", () => {
    /**
     * The commonest thing to type, because in a browser's URL bar the query
     * *is* part of the address. It used to come back as `invalid_segment`,
     * which is true and tells nobody what to do instead.
     */
    test("is named, not folded into invalid_segment", () => {
        const result = parsePathPattern("/game?id=:game_id");

        expect(result.ok).toBe(false);
        expect(!result.ok && result.reason).toBe("query_in_path");
    });

    test("is caught wherever the ? appears", () => {
        for (const input of ["/?a=1", "/a/b?c", "?x=1", "/search?"]) {
            const result = parsePathPattern(input);

            expect(!result.ok && result.reason).toBe("query_in_path");
        }
    });

    /** A fragment never leaves the browser, so it is a separate mistake. */
    test("a fragment is its own reason", () => {
        const result = parsePathPattern("/game#top");

        expect(!result.ok && result.reason).toBe("fragment_in_path");
    });

    /** The query is reported first: it is the half that could have been sent. */
    test("a path with both reports the query", () => {
        const result = parsePathPattern("/game?id=1#top");

        expect(!result.ok && result.reason).toBe("query_in_path");
    });

    /**
     * And the route the reader is pointed at really does answer the call they
     * were trying to describe — matching strips the query before it looks, so
     * one route covers every value of `id`.
     */
    test("the route they wanted matches the request they meant", () => {
        expect(parsePathPattern("/game").ok).toBe(true);
        expect(splitRequestPath("/game?id=7")).toEqual(["game"]);
        expect(splitRequestPath("/game?id=8&sort=name")).toEqual(["game"]);
        expect(splitRequestPath("/game")).toEqual(["game"]);
    });
});

describe("parseMockPath", () => {
    /**
     * The route handler gets this split from Next's dynamic segments. The proxy
     * does not — and the proxy is the only place a `QUERY` request can be
     * served, because a `route.ts` cannot export one.
     */
    test("splits the server key from the path", () => {
        expect(parseMockPath("/m/payments-api/users/7", "/m")).toEqual({
            serverKey: "payments-api",
            path: "/users/7",
        });
    });

    test("a bare server address is the root path", () => {
        expect(parseMockPath("/m/payments-api", "/m")).toEqual({
            serverKey: "payments-api",
            path: "/",
        });
    });

    test("a trailing slash is the root path too", () => {
        expect(parseMockPath("/m/payments-api/", "/m")).toEqual({
            serverKey: "payments-api",
            path: "/",
        });
    });

    /**
     * Left encoded on purpose: `splitRequestPath` decodes each segment *after*
     * splitting, and decoding earlier turns a `%2F` into a separator — which is
     * how a traversal walks through a router that reads as correct.
     */
    test("leaves the path encoded for the splitter to decode", () => {
        expect(parseMockPath("/m/api/a%2Fb/c", "/m")?.path).toBe("/a%2Fb/c");
    });

    test("keeps a query-looking path intact, since the caller strips it", () => {
        expect(parseMockPath("/m/api/search", "/m")?.serverKey).toBe("api");
    });

    describe("refusals", () => {
        test("refuses a path outside the prefix", () => {
            expect(parseMockPath("/tools/uuid", "/m")).toBeNull();
        });

        /** `/mock` must not be read as the `/m` prefix plus `ock`. */
        test("refuses a path that merely starts with the prefix's letters", () => {
            expect(parseMockPath("/mock/whatever", "/m")).toBeNull();
        });

        test("refuses the bare prefix, which names no server", () => {
            expect(parseMockPath("/m", "/m")).toBeNull();
            expect(parseMockPath("/m/", "/m")).toBeNull();
        });
    });
});
