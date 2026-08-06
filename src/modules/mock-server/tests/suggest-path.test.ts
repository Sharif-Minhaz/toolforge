import { describe, expect, test } from "bun:test";

import { splitJsonPath } from "@/modules/mock-server/domain/json-path";
import { UPLOAD_FILE_KEYS } from "@/modules/mock-server/domain/request-body";
import {
    COMMON_REQUEST_HEADERS,
    EMPTY_REQUEST_FACTS,
    MAX_SUGGESTIONS,
    collectObservedPaths,
    filterSuggestions,
    jsonTypeName,
    mergeObservedPaths,
    suggestNames,
    suggestRequestPaths,
    type PathSuggestion,
    type RequestFacts,
} from "@/modules/mock-server/domain/suggest-path";
import type { JsonValue } from "@/modules/mock-server/types/graph";

function facts(over: Partial<RequestFacts["observed"]> & { params?: readonly string[] }) {
    const { params = [], ...observed } = over;

    return {
        params,
        observed: { ...EMPTY_REQUEST_FACTS.observed, ...observed },
    } satisfies RequestFacts;
}

function paths(all: readonly PathSuggestion[]): readonly string[] {
    return all.map((entry) => entry.path);
}

function fromBody(body: JsonValue) {
    return facts({ body: mergeObservedPaths([body]), samples: 1 });
}

describe("collectObservedPaths", () => {
    test("names a top-level field and its type", () => {
        expect([...collectObservedPaths({ id: 7 })]).toEqual([["id", "number"]]);
    });

    test("descends into an object", () => {
        expect([...collectObservedPaths({ user: { city: "Dhaka" } })]).toEqual([
            ["user", "object"],
            ["user.city", "string"],
        ]);
    });

    /** The whole point of the picker for the case that prompted it. */
    test("reaches an upload's properties from a logged multipart body", () => {
        const logged = { avatar: { filename: "a.png", contentType: "image/png", size: 2048 } };

        expect([...collectObservedPaths(logged).keys()]).toEqual([
            "avatar",
            "avatar.filename",
            "avatar.contentType",
            "avatar.size",
        ]);
    });

    /**
     * Index zero only. Every element says the same thing about shape, and
     * walking them all multiplies the list by the array's length.
     */
    test("offers the array and its first element, not every element", () => {
        const found = [
            ...collectObservedPaths({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] }).keys(),
        ];

        expect(found).toEqual(["items", "items[0]", "items[0].id"]);
    });

    test("says nothing about an empty array beyond its own path", () => {
        expect([...collectObservedPaths({ items: [] }).keys()]).toEqual(["items"]);
    });

    test("a scalar body has no paths in it", () => {
        expect(collectObservedPaths("hello").size).toBe(0);
    });

    test("null is a type, not an absence", () => {
        expect(collectObservedPaths({ note: null }).get("note")).toBe("null");
    });

    /**
     * A key carrying a dot cannot be written bare, and the bracket form is what
     * `splitJsonPath` was given quote handling for.
     */
    test("brackets a key the dotted form cannot reach", () => {
        const found = [...collectObservedPaths({ "odd.key": 1 }).keys()];

        expect(found).toEqual(['["odd.key"]']);
        expect(splitJsonPath(found[0])).toEqual(["odd.key"]);
    });

    test("uses single quotes for a key containing a double quote", () => {
        const found = [...collectObservedPaths({ 'say"hi': 1 }).keys()];

        expect(found).toEqual(["['say\"hi']"]);
        expect(splitJsonPath(found[0])).toEqual(['say"hi']);
    });

    /**
     * No spelling reaches it, because a quoted section resolves no escapes. An
     * unparseable suggestion is worse than a missing one.
     */
    test("leaves out a key no spelling can reach", () => {
        expect(collectObservedPaths({ "both\"and'": 1 }).size).toBe(0);
    });

    test("stops descending past the depth cap", () => {
        let deep: JsonValue = "leaf";

        for (let level = 0; level < 20; level += 1) {
            deep = { down: deep };
        }

        const found = [...collectObservedPaths(deep).keys()];

        expect(found.length).toBeLessThan(20);
        expect(found.at(-1)?.startsWith("down.")).toBe(true);
    });

    test("caps a pathologically wide body", () => {
        const wide = Object.fromEntries(
            Array.from({ length: 900 }, (_, index) => [`f${index}`, index]),
        );

        expect(collectObservedPaths(wide).size).toBeLessThanOrEqual(250);
    });

    /** Every path it produces must read back through the real splitter. */
    test("produces paths the splitter understands", () => {
        const body = { a: { b: [{ "odd.key": 1 }] }, "say'hi": 2 };

        for (const path of collectObservedPaths(body).keys()) {
            expect(splitJsonPath(path).length).toBeGreaterThan(0);
        }
    });
});

describe("mergeObservedPaths", () => {
    /**
     * Union, not intersection: one caller omitting an optional field must not
     * empty the picker for everybody.
     */
    test("unions across samples", () => {
        const merged = mergeObservedPaths([{ a: 1 }, { b: "x" }]);

        expect(paths(merged.map((entry) => ({ ...entry, origin: "observed" })))).toEqual([
            "a",
            "b",
        ]);
    });

    test("the first sample's type wins", () => {
        const merged = mergeObservedPaths([{ note: "now a string" }, { note: null }]);

        expect(merged[0].type).toBe("string");
    });

    test("returns nothing for no samples", () => {
        expect(mergeObservedPaths([])).toEqual([]);
    });
});

describe("jsonTypeName", () => {
    test("distinguishes an array from an object", () => {
        expect(jsonTypeName([])).toBe("array");
        expect(jsonTypeName({})).toBe("object");
    });

    test("null is its own type", () => {
        expect(jsonTypeName(null)).toBe("null");
    });
});

describe("suggestRequestPaths — path parameters", () => {
    /**
     * The exact case: a route's parameters are invisible in the value editor,
     * and they are the one thing that can be known for certain.
     */
    test("offers every parameter the route declares", () => {
        expect(
            paths(suggestRequestPaths("param", "", facts({ params: ["game_id", "slot"] }))),
        ).toEqual(["slot", "game_id"]);
    });

    test("marks them as read off the route", () => {
        expect(suggestRequestPaths("param", "", facts({ params: ["id"] }))[0].origin).toBe("route");
    });

    test("narrows as the reader types", () => {
        const found = suggestRequestPaths("param", "ga", facts({ params: ["game_id", "slot"] }));

        expect(paths(found)).toEqual(["game_id"]);
    });
});

describe("suggestRequestPaths — body", () => {
    test("offers what recent requests carried", () => {
        expect(paths(suggestRequestPaths("body", "", fromBody({ email: "a@b.c" })))).toEqual([
            "email",
        ]);
    });

    /**
     * The screenshot that prompted this: `avatar` and a dot, on a route whose
     * upload nothing has logged yet.
     */
    test("offers an upload's properties after a dot, with no traffic at all", () => {
        const found = suggestRequestPaths("body", "avatar.", EMPTY_REQUEST_FACTS);

        expect(paths(found)).toEqual(["avatar.size", "avatar.filename", "avatar.contentType"]);
        expect(found.every((entry) => entry.origin === "upload")).toBe(true);
    });

    test("keeps narrowing once a property is half typed", () => {
        expect(paths(suggestRequestPaths("body", "avatar.cont", EMPTY_REQUEST_FACTS))).toEqual([
            "avatar.contentType",
        ]);
    });

    test("offers nothing for a bare dot, which names no field", () => {
        expect(suggestRequestPaths("body", ".", EMPTY_REQUEST_FACTS)).toEqual([]);
    });

    /** Observed beats guessed, and the same path must not appear twice. */
    test("an observed upload property is listed once, as observed", () => {
        const found = suggestRequestPaths(
            "body",
            "avatar.",
            fromBody({ avatar: { contentType: "image/webp" } }),
        );

        expect(paths(found).filter((path) => path === "avatar.contentType")).toHaveLength(1);
        expect(found[0]).toEqual({
            path: "avatar.contentType",
            origin: "observed",
            type: "string",
        });
    });

    test("a prefix match outranks a match in the middle", () => {
        const found = suggestRequestPaths("body", "cit", fromBody({ city: 1, home_city: 2 }));

        expect(paths(found)).toEqual(["city", "home_city"]);
    });

    test("drops a suggestion identical to what is already typed", () => {
        expect(suggestRequestPaths("body", "email", fromBody({ email: "a" }))).toEqual([]);
    });

    test("matches case-insensitively", () => {
        expect(paths(suggestRequestPaths("body", "EMA", fromBody({ email: "a" })))).toEqual([
            "email",
        ]);
    });
});

describe("suggestRequestPaths — headers", () => {
    test("offers the common list when nothing has been observed", () => {
        const found = suggestRequestPaths("header", "content-", EMPTY_REQUEST_FACTS);

        expect(paths(found)).toEqual(["content-type", "content-length"]);
        expect(found.every((entry) => entry.origin === "common")).toBe(true);
    });

    /** What actually arrived outranks what usually does. */
    test("an observed header outranks the common list", () => {
        const found = suggestRequestPaths("header", "", facts({ headers: ["x-tenant"] }));

        expect(found[0]).toEqual({ path: "x-tenant", origin: "observed" });
    });

    test("a header in both lists appears once, as observed", () => {
        const found = suggestRequestPaths("header", "content-type", facts({ headers: [] }));
        const both = suggestRequestPaths("header", "", facts({ headers: ["content-type"] }));

        expect(found).toEqual([]);
        expect(paths(both).filter((path) => path === "content-type")).toHaveLength(1);
        expect(both[0].origin).toBe("observed");
    });

    test("every common header is lower-cased, as the runtime hands them over", () => {
        for (const header of COMMON_REQUEST_HEADERS) {
            expect(header).toBe(header.toLowerCase());
        }
    });
});

describe("suggestRequestPaths — query and cookies", () => {
    test("offers query keys seen on this route", () => {
        expect(paths(suggestRequestPaths("query", "", facts({ query: ["is_stock"] })))).toEqual([
            "is_stock",
        ]);
    });

    /**
     * Never suggested, and not an oversight: the `cookie` header is redacted
     * before a log row is written, so nothing recorded holds a cookie name.
     */
    test("never suggests a cookie name", () => {
        expect(suggestRequestPaths("cookie", "", facts({ headers: ["cookie"] }))).toEqual([]);
    });
});

describe("filterSuggestions", () => {
    test("caps the list", () => {
        const many = Array.from({ length: 200 }, (_, index) => ({
            path: `field_${index}`,
            origin: "observed" as const,
        }));

        expect(filterSuggestions(many, "")).toHaveLength(MAX_SUGGESTIONS);
    });

    test("shorter paths come first at equal rank", () => {
        const found = filterSuggestions(
            [
                { path: "user.address.city", origin: "observed" },
                { path: "user.id", origin: "observed" },
            ],
            "user",
        );

        expect(paths(found)).toEqual(["user.id", "user.address.city"]);
    });

    test("an empty needle keeps everything", () => {
        expect(filterSuggestions([{ path: "a", origin: "observed" }], "   ")).toHaveLength(1);
    });
});

describe("suggestNames", () => {
    test("filters a flat name list", () => {
        expect(paths(suggestNames(["userId", "orderId"], "user", "graph"))).toEqual(["userId"]);
    });

    test("carries the origin it was given", () => {
        expect(suggestNames(["API_BASE"], "", "observed")[0].origin).toBe("observed");
    });
});

describe("UPLOAD_FILE_KEYS", () => {
    /** A drift here would offer a property an upload does not have. */
    test("is exactly what a parsed file part carries", () => {
        expect([...UPLOAD_FILE_KEYS].toSorted()).toEqual(["contentType", "filename", "size"]);
    });
});
