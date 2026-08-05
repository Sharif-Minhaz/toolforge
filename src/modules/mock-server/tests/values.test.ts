import { describe, expect, test } from "bun:test";

import { MAX_ARRAY_ITEMS, MAX_VALUE_DEPTH } from "@/modules/mock-server/domain/constants";
import { readJsonPath, readStringMap, splitJsonPath } from "@/modules/mock-server/domain/json-path";
import {
    createSeededRandom,
    randomInt,
    resolveSeed,
    seededUuid,
} from "@/modules/mock-server/domain/seeded-random";
import { resolveValue } from "@/modules/mock-server/domain/values";
import type {
    ExecutionContext,
    JsonValue,
    NormalizedRequest,
    ValueExpr,
} from "@/modules/mock-server/types/graph";

const REQUEST: NormalizedRequest = {
    method: "POST",
    path: "/orgs/acme/users/42",
    params: { org: "acme", id: "42" },
    query: { page: "2", sort: "name" },
    headers: { "content-type": "application/json", authorization: "Bearer abc" },
    cookies: { session: "s1", Theme: "dark" },
    body: {
        email: "ada@example.com",
        profile: { city: "Dhaka", tags: ["a", "b"] },
        items: [{ id: 1 }, { id: 2 }],
        "odd.key": "dotted",
    },
};

function context(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
    return {
        request: REQUEST,
        env: { API_BASE: "https://api.example.com", Mixed: "case" },
        clock: () => 0,
        now: () => Date.parse("2026-08-05T09:00:00.000Z"),
        sleep: async () => {},
        random: createSeededRandom("fixed"),
        deadlineAt: Number.MAX_SAFE_INTEGER,
        vars: { greeting: "hi" },
        ...overrides,
    };
}

function value(expr: ValueExpr, overrides: Partial<ExecutionContext> = {}): JsonValue {
    const result = resolveValue(expr, context(overrides));

    if (!result.ok) {
        throw new Error(`expected a value, got ${result.reason}`);
    }

    return result.value;
}

describe("splitJsonPath", () => {
    test("splits on dots", () => {
        expect(splitJsonPath("a.b.c")).toEqual(["a", "b", "c"]);
    });

    test("splits bracket indexes", () => {
        expect(splitJsonPath("items[0].id")).toEqual(["items", "0", "id"]);
    });

    test("reads an empty path as no steps", () => {
        expect(splitJsonPath("")).toEqual([]);
    });

    test("ignores whitespace around the whole path", () => {
        expect(splitJsonPath("  a.b  ")).toEqual(["a", "b"]);
    });

    /** A key containing a dot is only reachable through brackets and quotes. */
    test("strips quotes inside brackets so a dotted key stays one step", () => {
        expect(splitJsonPath('["odd.key"]')).toEqual(["odd.key"]);
    });

    test("tolerates a leading dot", () => {
        expect(splitJsonPath(".a.b")).toEqual(["a", "b"]);
    });
});

describe("readJsonPath", () => {
    const source = REQUEST.body;

    test("reads a top-level key", () => {
        expect(readJsonPath(source, "email")).toBe("ada@example.com");
    });

    test("reads a nested key", () => {
        expect(readJsonPath(source, "profile.city")).toBe("Dhaka");
    });

    test("reads an array element", () => {
        expect(readJsonPath(source, "items[0].id")).toBe(1);
    });

    test("reads a whole subtree", () => {
        expect(readJsonPath(source, "profile.tags")).toEqual(["a", "b"]);
    });

    /** The empty path is what makes "the whole body" a selectable option. */
    test("returns the root for an empty path", () => {
        expect(readJsonPath(source, "")).toEqual(source);
    });

    test("misses a key that is not there", () => {
        expect(readJsonPath(source, "nope")).toBeNull();
    });

    test("misses a key below a scalar", () => {
        expect(readJsonPath(source, "email.length")).toBeNull();
    });

    test("misses an index past the end", () => {
        expect(readJsonPath(source, "items[9].id")).toBeNull();
    });

    test("misses a negative index", () => {
        expect(readJsonPath(source, "items[-1]")).toBeNull();
    });

    test("misses a non-numeric key into an array", () => {
        expect(readJsonPath(source, "items.length")).toBeNull();
    });

    test("misses everything when the body never arrived", () => {
        expect(readJsonPath(null, "a.b")).toBeNull();
    });

    /** Inherited properties are not data somebody sent. */
    test("does not read through the prototype chain", () => {
        expect(readJsonPath(source, "constructor")).toBeNull();
        expect(readJsonPath(source, "__proto__")).toBeNull();
    });
});

describe("readStringMap", () => {
    test("reads an exact key", () => {
        expect(readStringMap({ a: "1" }, "a", false)).toBe("1");
    });

    /** HTTP defines header names as case-insensitive; cookies are not. */
    test("matches a header case-insensitively", () => {
        expect(readStringMap(REQUEST.headers, "Authorization", true)).toBe("Bearer abc");
    });

    test("does not fold case where it must not", () => {
        expect(readStringMap(REQUEST.cookies, "theme", false)).toBeNull();
        expect(readStringMap(REQUEST.cookies, "Theme", false)).toBe("dark");
    });

    test("misses an empty key", () => {
        expect(readStringMap({ a: "1" }, "  ", true)).toBeNull();
    });
});

describe("request values", () => {
    test("reads the body", () => {
        expect(value({ kind: "request", source: "body", path: "email" })).toBe("ada@example.com");
    });

    test("reads a path parameter", () => {
        expect(value({ kind: "request", source: "param", path: "id" })).toBe("42");
    });

    test("reads a query parameter", () => {
        expect(value({ kind: "request", source: "query", path: "page" })).toBe("2");
    });

    test("reads a header whatever case it was asked for in", () => {
        expect(value({ kind: "request", source: "header", path: "AUTHORIZATION" })).toBe(
            "Bearer abc",
        );
    });

    test("reads a cookie", () => {
        expect(value({ kind: "request", source: "cookie", path: "session" })).toBe("s1");
    });

    /**
     * A mock that throws because the caller left out an optional field is a mock
     * that fails on exactly the request its author was modelling.
     */
    test("misses rather than failing when the field is absent", () => {
        expect(value({ kind: "request", source: "body", path: "missing.deep" })).toBeNull();
    });
});

describe("environment and variables", () => {
    test("reads an environment value", () => {
        expect(value({ kind: "env", key: "API_BASE" })).toBe("https://api.example.com");
    });

    test("environment keys are case-sensitive", () => {
        expect(value({ kind: "env", key: "mixed" })).toBeNull();
    });

    test("reads a variable", () => {
        expect(value({ kind: "var", name: "greeting" })).toBe("hi");
    });

    test("an unset variable is a miss, not a failure", () => {
        expect(value({ kind: "var", name: "nothing" })).toBeNull();
    });
});

describe("time", () => {
    test("renders ISO-8601 by default", () => {
        expect(value({ kind: "now", format: "iso" })).toBe("2026-08-05T09:00:00.000Z");
    });

    test("renders epoch milliseconds", () => {
        expect(value({ kind: "now", format: "epochMs" })).toBe(1_785_920_400_000);
    });

    test("renders epoch seconds", () => {
        expect(value({ kind: "now", format: "epochSeconds" })).toBe(1_785_920_400);
    });

    /** The wall clock is `now`, never `clock` — `clock` is monotonic. */
    test("does not read the monotonic clock", () => {
        expect(value({ kind: "now", format: "epochMs" }, { clock: () => 999 })).toBe(
            1_785_920_400_000,
        );
    });
});

describe("uuid", () => {
    test("produces a well-formed v4", () => {
        expect(value({ kind: "uuid" })).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    test("repeats for the same seed", () => {
        const a = seededUuid(createSeededRandom("x"));
        const b = seededUuid(createSeededRandom("x"));

        expect(a).toBe(b);
    });

    test("differs for a different seed", () => {
        expect(seededUuid(createSeededRandom("x"))).not.toBe(seededUuid(createSeededRandom("y")));
    });

    test("two draws from one generator differ", () => {
        const random = createSeededRandom("x");

        expect(seededUuid(random)).not.toBe(seededUuid(random));
    });
});

describe("template", () => {
    test("joins literals and values", () => {
        expect(
            value({
                kind: "template",
                parts: ["Hello ", { kind: "request", source: "body", path: "profile.city" }, "!"],
            }),
        ).toBe("Hello Dhaka!");
    });

    /** "Hello null" is never what somebody building `Hello {name}` meant. */
    test("renders a miss as nothing rather than the word null", () => {
        expect(
            value({
                kind: "template",
                parts: ["Hello ", { kind: "request", source: "body", path: "absent" }, "!"],
            }),
        ).toBe("Hello !");
    });

    test("renders a number without quoting it", () => {
        expect(
            value({
                kind: "template",
                parts: [{ kind: "request", source: "body", path: "items[0].id" }],
            }),
        ).toBe("1");
    });

    test("stringifies an object part", () => {
        expect(
            value({
                kind: "template",
                parts: [{ kind: "request", source: "body", path: "profile.tags" }],
            }),
        ).toBe('["a","b"]');
    });

    test("an empty template is the empty string", () => {
        expect(value({ kind: "template", parts: [] })).toBe("");
    });
});

describe("oneOf", () => {
    test("picks one of the options", () => {
        const picked = value({
            kind: "oneOf",
            options: [
                { kind: "static", value: "a" },
                { kind: "static", value: "b" },
            ],
        });

        expect(["a", "b"]).toContain(picked as string);
    });

    test("picks the same option for the same seed", () => {
        const expr: ValueExpr = {
            kind: "oneOf",
            options: Array.from({ length: 20 }, (_, index) => ({
                kind: "static" as const,
                value: index,
            })),
        };

        expect(value(expr, { random: createSeededRandom("s") })).toBe(
            value(expr, { random: createSeededRandom("s") }) as number,
        );
    });

    test("an empty option list is a miss, not a failure", () => {
        expect(value({ kind: "oneOf", options: [] })).toBeNull();
    });
});

describe("objects and arrays", () => {
    test("builds a nested object", () => {
        expect(
            value({
                kind: "object",
                fields: [
                    {
                        key: "city",
                        value: { kind: "request", source: "body", path: "profile.city" },
                    },
                    {
                        key: "meta",
                        value: {
                            kind: "object",
                            fields: [
                                {
                                    key: "page",
                                    value: { kind: "request", source: "query", path: "page" },
                                },
                            ],
                        },
                    },
                ],
            }),
        ).toEqual({ city: "Dhaka", meta: { page: "2" } });
    });

    /** The tree editor always keeps one blank row waiting to be filled. */
    test("skips a field with no key", () => {
        expect(
            value({
                kind: "object",
                fields: [
                    { key: "", value: { kind: "static", value: 1 } },
                    { key: "a", value: { kind: "static", value: 2 } },
                ],
            }),
        ).toEqual({ a: 2 });
    });

    /**
     * Resolved per item rather than once and copied, or an array of fake people
     * would be one person repeated.
     */
    test("resolves each array item independently", () => {
        const drawn = value({
            kind: "array",
            of: { kind: "uuid" },
            count: { kind: "fixed", n: 3 },
        }) as string[];

        expect(new Set(drawn).size).toBe(3);
    });

    test("clamps a count past the item ceiling", () => {
        const items = value({
            kind: "array",
            of: { kind: "static", value: 0 },
            count: { kind: "fixed", n: MAX_ARRAY_ITEMS * 5 },
        }) as JsonValue[];

        expect(items).toHaveLength(MAX_ARRAY_ITEMS);
    });

    test("refuses a tree deeper than the cap", () => {
        let expr: ValueExpr = { kind: "static", value: 1 };

        for (let index = 0; index <= MAX_VALUE_DEPTH + 2; index += 1) {
            expr = { kind: "object", fields: [{ key: "a", value: expr }] };
        }

        expect(resolveValue(expr, context())).toEqual({
            ok: false,
            reason: "value_depth_exceeded",
        });
    });
});

describe("faker", () => {
    /**
     * A response that quietly says `null` where a name was asked for is harder
     * to diagnose than one that says it could not produce a name.
     */
    test("refuses when no provider is injected", () => {
        expect(resolveValue({ kind: "faker", fn: "personFullName" }, context())).toEqual({
            ok: false,
            reason: "unsupported_value",
        });
    });

    test("refuses an id the registry does not carry", () => {
        expect(
            resolveValue({ kind: "faker", fn: "personSoulmate" }, context({ faker: () => "nope" })),
        ).toEqual({ ok: false, reason: "unsupported_value" });
    });

    test("uses the injected provider when there is one", () => {
        expect(
            value({ kind: "faker", fn: "personFullName" }, { faker: () => "Ada Lovelace" }),
        ).toBe("Ada Lovelace");
    });
});

describe("the seeded generator", () => {
    test("repeats exactly for one seed", () => {
        const a = createSeededRandom("seed");
        const b = createSeededRandom("seed");

        expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
    });

    /** One character's difference must change everything, not shift it. */
    test("neighbouring seeds do not give neighbouring output", () => {
        const a = createSeededRandom("seed1")();
        const b = createSeededRandom("seed2")();

        expect(Math.abs(a - b)).toBeGreaterThan(0.001);
    });

    test("stays inside [0, 1)", () => {
        const random = createSeededRandom("range");

        for (let index = 0; index < 5_000; index += 1) {
            const draw = random();

            expect(draw).toBeGreaterThanOrEqual(0);
            expect(draw).toBeLessThan(1);
        }
    });

    test("does not immediately repeat itself", () => {
        const random = createSeededRandom("cycle");
        const draws = Array.from({ length: 1_000 }, random);

        expect(new Set(draws).size).toBeGreaterThan(990);
    });

    test("spreads roughly evenly across the range", () => {
        const random = createSeededRandom("spread");
        const buckets = new Array(10).fill(0) as number[];

        for (let index = 0; index < 10_000; index += 1) {
            buckets[Math.floor(random() * 10)] += 1;
        }

        for (const count of buckets) {
            expect(count).toBeGreaterThan(800);
            expect(count).toBeLessThan(1_200);
        }
    });

    test("randomInt includes both ends", () => {
        const random = createSeededRandom("ints");
        const seen = new Set<number>();

        for (let index = 0; index < 500; index += 1) {
            seen.add(randomInt(random, 1, 3));
        }

        expect([...seen].toSorted()).toEqual([1, 2, 3]);
    });

    test("randomInt collapses an inverted range to the minimum", () => {
        expect(randomInt(createSeededRandom("x"), 5, 2)).toBe(5);
    });
});

describe("resolveSeed", () => {
    test("uses an explicit seed when one is given", () => {
        expect(resolveSeed("pinned", "e1", "/a")).toBe("pinned");
    });

    test("falls back to the endpoint and path", () => {
        expect(resolveSeed(undefined, "e1", "/a")).toBe("e1:/a");
    });

    test("treats an empty seed as absent", () => {
        expect(resolveSeed("   ", "e1", "/a")).toBe("e1:/a");
    });

    /** Two routes must not hand back the same "random" name. */
    test("gives two paths different derived seeds", () => {
        expect(resolveSeed(undefined, "e1", "/a")).not.toBe(resolveSeed(undefined, "e1", "/b"));
    });
});

describe("reproducibility", () => {
    /** The invariant the whole injected-context design exists for. */
    test("one seed over a mixed tree gives identical output", () => {
        const expr: ValueExpr = {
            kind: "object",
            fields: [
                { key: "id", value: { kind: "uuid" } },
                {
                    key: "list",
                    value: {
                        kind: "array",
                        of: { kind: "uuid" },
                        count: { kind: "range", min: 1, max: 9 },
                    },
                },
                {
                    key: "pick",
                    value: {
                        kind: "oneOf",
                        options: [
                            { kind: "static", value: "a" },
                            { kind: "static", value: "b" },
                            { kind: "static", value: "c" },
                        ],
                    },
                },
            ],
        };

        const first = JSON.stringify(value(expr, { random: createSeededRandom("pinned") }));
        const second = JSON.stringify(value(expr, { random: createSeededRandom("pinned") }));

        expect(first).toBe(second);
    });

    test("a different seed gives different output", () => {
        const expr: ValueExpr = {
            kind: "array",
            of: { kind: "uuid" },
            count: { kind: "fixed", n: 4 },
        };

        expect(JSON.stringify(value(expr, { random: createSeededRandom("a") }))).not.toBe(
            JSON.stringify(value(expr, { random: createSeededRandom("b") })),
        );
    });
});
