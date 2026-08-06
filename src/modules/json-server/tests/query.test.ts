import { describe, expect, test } from "bun:test";

import { DEFAULT_PER_PAGE, MAX_WHERE_DEPTH } from "@/modules/json-server/domain/constants";
import {
    applyEmbeds,
    CONDITION_OPERATORS,
    type ConditionOperator,
    evaluateWhere,
    foreignKeyFor,
    matchesCondition,
    paginate,
    type QueryPairs,
    readPath,
    runQuery,
    singularize,
    sortRecords,
} from "@/modules/json-server/domain/query";
import type { JsonObject, JsonValue } from "@/modules/tools/types/json-document";

const POSTS: readonly JsonObject[] = [
    { id: "1", title: "Hello world", views: 100, author: { name: "typicode" }, draft: false },
    { id: "2", title: "another title", views: 200, author: { name: "alice" }, draft: true },
    { id: "3", title: "Third POST", views: 50, author: { name: "mallory" }, draft: false },
];

function query(...pairs: [string, string][]): QueryPairs {
    return pairs;
}

function ids(records: readonly JsonValue[]): string[] {
    return records.map((record) => (record as JsonObject).id as string);
}

describe("readPath", () => {
    test("reads a top-level field", () => {
        expect(readPath(POSTS[0], "title")).toBe("Hello world");
    });

    test("descends a dotted path", () => {
        expect(readPath(POSTS[0], "author.name")).toBe("typicode");
    });

    test("a missing field is undefined, not null", () => {
        expect(readPath(POSTS[0], "nope")).toBeUndefined();
        expect(readPath(POSTS[0], "author.nope")).toBeUndefined();
    });

    /** Supporting one form of index quietly invites the ones it does not. */
    test("does not index into an array", () => {
        expect(readPath({ tags: ["a", "b"] }, "tags.0")).toBeUndefined();
    });

    test("descending through a scalar stops rather than throwing", () => {
        expect(readPath(POSTS[0], "title.length")).toBeUndefined();
    });
});

describe("matchesCondition", () => {
    /**
     * The rule the whole operator table rests on: the query's text is coerced to
     * the stored value's type, never the reverse. `"9" < "10"` is false as
     * strings, and a filter that got this backwards would return the wrong
     * records while looking perfectly plausible.
     */
    test("compares numbers numerically, not lexicographically", () => {
        expect(matchesCondition({ views: 10 }, "views", "gt", "9")).toBe(true);
        expect(matchesCondition({ views: 9 }, "views", "gt", "10")).toBe(false);
    });

    test("compares strings as strings", () => {
        expect(matchesCondition({ title: "b" }, "title", "gt", "a")).toBe(true);
    });

    test("eq on a number field matches the numeric spelling", () => {
        expect(matchesCondition({ views: 100 }, "views", "eq", "100")).toBe(true);
    });

    test("eq with no operator is what a bare ?field=value means", () => {
        expect(matchesCondition({ title: "x" }, "title", "eq", "x")).toBe(true);
        expect(matchesCondition({ title: "x" }, "title", "eq", "y")).toBe(false);
    });

    test("ne is the complement of eq", () => {
        for (const record of POSTS) {
            expect(matchesCondition(record, "views", "ne", "100")).toBe(
                !matchesCondition(record, "views", "eq", "100"),
            );
        }
    });

    test("lte and gte include the boundary", () => {
        expect(matchesCondition({ views: 100 }, "views", "lte", "100")).toBe(true);
        expect(matchesCondition({ views: 100 }, "views", "gte", "100")).toBe(true);
        expect(matchesCondition({ views: 100 }, "views", "lt", "100")).toBe(false);
        expect(matchesCondition({ views: 100 }, "views", "gt", "100")).toBe(false);
    });

    test("booleans compare against true and false", () => {
        expect(matchesCondition({ draft: true }, "draft", "eq", "true")).toBe(true);
        expect(matchesCondition({ draft: false }, "draft", "eq", "false")).toBe(true);
        expect(matchesCondition({ draft: true }, "draft", "eq", "false")).toBe(false);
    });

    describe("in", () => {
        test("matches any of a comma-separated list", () => {
            expect(matchesCondition({ id: "a" }, "id", "in", "a,b,c")).toBe(true);
            expect(matchesCondition({ id: "z" }, "id", "in", "a,b,c")).toBe(false);
        });

        /** Split before coercing, or the whole list is compared as one string. */
        test("coerces each part on its own", () => {
            expect(matchesCondition({ views: 200 }, "views", "in", "100,200")).toBe(true);
            expect(matchesCondition({ views: 300 }, "views", "in", "100,200")).toBe(false);
        });

        test("trims the parts", () => {
            expect(matchesCondition({ views: 200 }, "views", "in", "100, 200")).toBe(true);
        });
    });

    describe("text operators", () => {
        test("contains is case-insensitive both ways", () => {
            expect(matchesCondition({ title: "Hello world" }, "title", "contains", "hello")).toBe(
                true,
            );
            expect(matchesCondition({ title: "hello world" }, "title", "contains", "HELLO")).toBe(
                true,
            );
        });

        test("startsWith and endsWith anchor", () => {
            expect(matchesCondition({ title: "Hello" }, "title", "startsWith", "hel")).toBe(true);
            expect(matchesCondition({ title: "Hello" }, "title", "startsWith", "ello")).toBe(false);
            expect(matchesCondition({ title: "Hello" }, "title", "endsWith", "LLO")).toBe(true);
        });

        /** A number is not a haystack; matching it would be a coincidence. */
        test("a non-string field never matches a text operator", () => {
            expect(matchesCondition({ views: 100 }, "views", "contains", "0")).toBe(false);
        });
    });

    test("a missing field never matches anything but ne", () => {
        for (const operator of CONDITION_OPERATORS) {
            const matched = matchesCondition({}, "nope", operator, "x");

            expect(matched).toBe(operator === "ne");
        }
    });

    test("works through a dotted path", () => {
        expect(matchesCondition(POSTS[0], "author.name", "eq", "typicode")).toBe(true);
    });

    /**
     * Two values with no shared ordering have to say "no", not throw and not
     * silently return every record.
     */
    test("comparing across kinds is a miss rather than an error", () => {
        expect(matchesCondition({ views: null }, "views", "gt", "10")).toBe(false);
        expect(matchesCondition({ views: [1, 2] }, "views", "gt", "10")).toBe(false);
        expect(matchesCondition({ views: { n: 1 } }, "views", "lt", "10")).toBe(false);
    });

    /**
     * The query value is coerced by its own literal shape and never against the
     * field. Cross-checked against `json-server`'s `parse-where.js`, and the
     * consequence below is the reference's too: a numeric-looking query cannot
     * match a string field, so a zero-padded code is unreachable by `?code=007`.
     */
    describe("coercion", () => {
        test("reads true, false and null as those values", () => {
            expect(matchesCondition({ draft: true }, "draft", "eq", "true")).toBe(true);
            expect(matchesCondition({ x: null }, "x", "eq", "null")).toBe(true);
            expect(matchesCondition({ x: "null" }, "x", "eq", "null")).toBe(false);
        });

        test("reads anything numeric as a number", () => {
            expect(matchesCondition({ views: 100 }, "views", "eq", "100")).toBe(true);
            expect(matchesCondition({ views: "100" }, "views", "eq", "100")).toBe(false);
        });

        test("so a zero-padded string code cannot be matched numerically", () => {
            expect(matchesCondition({ code: "007" }, "code", "eq", "007")).toBe(false);
            expect(matchesCondition({ code: "007" }, "code", "contains", "007")).toBe(true);
        });

        test("leaves everything else as text", () => {
            expect(matchesCondition({ title: "x" }, "title", "eq", "x")).toBe(true);
        });
    });
});

describe("sortRecords", () => {
    test("ascending by default", () => {
        expect(ids(sortRecords(POSTS, "views"))).toEqual(["3", "1", "2"]);
    });

    test("a leading minus is descending", () => {
        expect(ids(sortRecords(POSTS, "-views"))).toEqual(["2", "1", "3"]);
    });

    test("sorts by a dotted path", () => {
        expect(ids(sortRecords(POSTS, "author.name"))).toEqual(["2", "3", "1"]);
    });

    test("later keys break ties left by earlier ones", () => {
        const rows = [
            { id: "a", group: 1, n: 2 },
            { id: "b", group: 1, n: 1 },
            { id: "c", group: 0, n: 9 },
        ];

        expect(ids(sortRecords(rows, "group,-n"))).toEqual(["c", "a", "b"]);
    });

    /** An in-place sort would silently reorder the stored collection on a GET. */
    test("never mutates the array it was given", () => {
        const before = ids(POSTS);
        sortRecords(POSTS, "-views");

        expect(ids(POSTS)).toEqual(before);
    });

    /** Without this the same query returns a different order on two replicas. */
    test("records missing the sort field land last, deterministically", () => {
        const rows: JsonObject[] = [{ id: "a" }, { id: "b", n: 1 }, { id: "c" }];

        expect(ids(sortRecords(rows, "n"))).toEqual(["b", "a", "c"]);
    });

    test("an empty spec is a no-op", () => {
        expect(ids(sortRecords(POSTS, ""))).toEqual(ids(POSTS));
    });
});

describe("paginate", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: String(index + 1) }));

    test("returns the envelope the reference documents", () => {
        const page = paginate(rows, 1, 25);

        expect(page).toMatchObject({
            first: 1,
            prev: null,
            next: 2,
            last: 4,
            pages: 4,
            items: 100,
        });
        expect(page.data).toHaveLength(25);
    });

    test("the middle page has both neighbours", () => {
        expect(paginate(rows, 2, 25)).toMatchObject({ prev: 1, next: 3 });
    });

    test("the last page has no next", () => {
        expect(paginate(rows, 4, 25)).toMatchObject({ prev: 3, next: null });
    });

    /** A paging loop that ran one past the end should land, not 400. */
    test("clamps a page past the end rather than refusing", () => {
        expect(ids(paginate(rows, 999, 25).data)).toEqual(ids(rows.slice(75)));
    });

    test("clamps a page below one", () => {
        expect(ids(paginate(rows, 0, 25).data)).toEqual(ids(rows.slice(0, 25)));
    });

    test("an empty collection is still one page", () => {
        expect(paginate([], 1, 10)).toMatchObject({ pages: 1, items: 0, next: null, prev: null });
    });

    test("a partial last page reports the real item count", () => {
        expect(paginate(rows.slice(0, 7), 1, 5)).toMatchObject({ pages: 2, items: 7 });
    });
});

describe("runQuery", () => {
    test("no query at all returns everything, unpaginated", () => {
        const outcome = runQuery(POSTS, query());

        expect(outcome).toMatchObject({ ok: true, paginated: false });
    });

    test("a bare field is an equality", () => {
        const outcome = runQuery(POSTS, query(["views", "200"]));

        expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["2"]);
    });

    /** `?views:gt=10&views:lt=90` is a range, not just the second half. */
    test("repeated conditions intersect", () => {
        const outcome = runQuery(POSTS, query(["views:gt", "40"], ["views:lt", "150"]));

        expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1", "3"]);
    });

    test("filters, then sorts, then pages", () => {
        const outcome = runQuery(
            POSTS,
            query(["draft", "false"], ["_sort", "-views"], ["_page", "1"], ["_per_page", "1"]),
        );

        expect(outcome.ok && outcome.paginated && outcome.page.items).toBe(2);
        expect(outcome.ok && outcome.paginated && ids(outcome.page.data)).toEqual(["1"]);
    });

    test("_page alone uses the default page size", () => {
        const rows = Array.from({ length: 30 }, (_, index) => ({ id: String(index + 1) }));
        const outcome = runQuery(rows, query(["_page", "1"]));

        expect(outcome.ok && outcome.paginated && outcome.page.data).toHaveLength(DEFAULT_PER_PAGE);
    });

    test("an unknown operator is a refusal rather than an ignored filter", () => {
        expect(runQuery(POSTS, query(["views:nope", "1"]))).toEqual({
            ok: false,
            reason: "invalid_query",
        });
    });

    test("reserved keys are never read as conditions", () => {
        const outcome = runQuery(POSTS, query(["_embed", "comments"], ["_dependent", "x"]));

        expect(outcome.ok && !outcome.paginated && outcome.data).toHaveLength(3);
    });

    describe("_where", () => {
        test("or across two clauses", () => {
            const where = JSON.stringify({
                or: [{ views: { gt: 150 } }, { author: { name: { lt: "m" } } }],
            });
            const outcome = runQuery(POSTS, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["2"]);
        });

        test("a bare value is an equality", () => {
            const outcome = runQuery(POSTS, query(["_where", JSON.stringify({ views: 100 })]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1"]);
        });

        test("and requires every clause", () => {
            const where = JSON.stringify({ and: [{ draft: false }, { views: { gt: 60 } }] });
            const outcome = runQuery(POSTS, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1"]);
        });

        /** The two syntaxes are alternatives; intersecting them answers neither. */
        test("overrides the flat conditions entirely", () => {
            const outcome = runQuery(
                POSTS,
                query(["views", "999"], ["_where", JSON.stringify({ views: 100 })]),
            );

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1"]);
        });

        /**
         * The reference ignores a `_where` it cannot read. That is the wrong
         * call for a debugging tool: a typo would return the whole collection
         * and look exactly like a filter that matched everything.
         */
        test("a malformed _where is a 400, not a silent no-op", () => {
            expect(runQuery(POSTS, query(["_where", "{not json"]))).toEqual({
                ok: false,
                reason: "invalid_query",
            });
        });

        /**
         * The reference's spelling of a dotted field: nesting under the parent
         * key rather than writing `"author.name"`. Without this the README's own
         * example query is a 400.
         */
        test("a nested object descends into a path", () => {
            const where = JSON.stringify({ author: { name: { eq: "alice" } } });
            const outcome = runQuery(POSTS, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["2"]);
        });

        test("descends more than one level", () => {
            const rows = [
                { id: "1", a: { b: { c: 1 } } },
                { id: "2", a: { b: { c: 2 } } },
            ];
            const where = JSON.stringify({ a: { b: { c: { gte: 2 } } } });
            const outcome = runQuery(rows, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["2"]);
        });

        /**
         * Every operator in one clause has to pass — they are an `and`, which
         * is `matches-where.js`'s rule.
         */
        test("applies every operator in a clause", () => {
            const where = JSON.stringify({ views: { gt: 40, lt: 150 } });
            const outcome = runQuery(POSTS, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1", "3"]);
        });

        /** Operands stay typed: an array reaches `in` as an array. */
        test("in takes an array operand without stringifying it", () => {
            const where = JSON.stringify({ id: { in: ["1", "2"] } });
            const outcome = runQuery(POSTS, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1", "2"]);
        });

        /** A missing field fails an operator clause rather than comparing undefined. */
        test("a record without the field never matches an operator clause", () => {
            const where = JSON.stringify({ nope: { gt: 0 } });
            const outcome = runQuery(POSTS, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && outcome.data).toEqual([]);
        });

        /**
         * There is no "unknown operator" inside `_where`, and there cannot be:
         * nesting *is* the path syntax. Only the flat spelling — `?views:nope=1`,
         * where the colon marks an operator unambiguously — can tell the two
         * apart, and that one is refused.
         */
        test("finds the record when the nested path really exists", () => {
            const rows: JsonObject[] = [
                { id: "1", views: { nope: 1 } },
                { id: "2", views: { nope: 2 } },
            ];
            const where = JSON.stringify({ views: { nope: 1 } });
            const outcome = runQuery(rows, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1"]);
        });

        /**
         * A nested clause against a field that is not an object **passes**.
         * That reads like a bug and is `matches-where.js`'s behaviour, matched
         * on purpose: a query that returns different rows here than against a
         * local `json-server` is the one defect a clone cannot have.
         */
        test("a nested clause against a non-object field passes, as the reference does", () => {
            const where = JSON.stringify({ views: { nope: 1 } });
            const outcome = runQuery(POSTS, query(["_where", where]));

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["1", "2", "3"]);
        });

        /**
         * The evaluator recurses; without a ceiling this is a stack overflow.
         * It has to come back `null` and not `false` — a depth refusal folded
         * into "no match" is an empty result set where a 400 belongs.
         */
        test("refuses a clause nested past the depth ceiling", () => {
            let clause: JsonValue = { views: 100 };

            for (let depth = 0; depth <= MAX_WHERE_DEPTH + 1; depth += 1) {
                clause = { or: [clause] };
            }

            expect(evaluateWhere(POSTS[0], clause)).toBeNull();
            expect(runQuery(POSTS, query(["_where", JSON.stringify(clause)]))).toEqual({
                ok: false,
                reason: "invalid_query",
            });
        });

        test("_where sorts and pages like anything else", () => {
            const outcome = runQuery(
                POSTS,
                query(["_where", JSON.stringify({ draft: false })], ["_sort", "views"]),
            );

            expect(outcome.ok && !outcome.paginated && ids(outcome.data)).toEqual(["3", "1"]);
        });
    });
});

describe("singularize", () => {
    test("handles the shapes a fixture actually uses", () => {
        expect(singularize("comments")).toBe("comment");
        expect(singularize("posts")).toBe("post");
        expect(singularize("categories")).toBe("category");
        expect(singularize("boxes")).toBe("box");
        expect(singularize("profile")).toBe("profile");
    });

    /** `address` must not become `addres`. */
    test("leaves a double-s word alone", () => {
        expect(singularize("address")).toBe("address");
    });

    test("builds the foreign key the reference uses", () => {
        expect(foreignKeyFor("posts")).toBe("postId");
    });
});

describe("applyEmbeds", () => {
    const document: JsonObject = {
        posts: [{ id: "1", title: "a" }],
        comments: [
            { id: "1", text: "x", postId: "1" },
            { id: "2", text: "y", postId: "9" },
        ],
    };

    test("attaches children by the parent's foreign key", () => {
        const [post] = applyEmbeds(
            document.posts as JsonValue[],
            "posts",
            query(["_embed", "comments"]),
            document,
        );

        expect((post as JsonObject).comments).toHaveLength(1);
    });

    /** An empty list says "no comments", which is not the same as saying nothing. */
    test("a parent with no children gets an empty array", () => {
        const lonely: JsonObject = { posts: [{ id: "7" }], comments: [] };
        const [post] = applyEmbeds(
            lonely.posts as JsonValue[],
            "posts",
            query(["_embed", "comments"]),
            lonely,
        );

        expect((post as JsonObject).comments).toEqual([]);
    });

    test("attaches the parent in the other direction", () => {
        const [comment] = applyEmbeds(
            document.comments as JsonValue[],
            "comments",
            query(["_embed", "post"]),
            { ...document, post: document.posts },
        );

        expect((comment as JsonObject).post).toMatchObject({ id: "1" });
    });

    /** A stale `_embed` in somebody's client must not break the request. */
    test("an unknown target is left alone rather than erroring", () => {
        const [post] = applyEmbeds(
            document.posts as JsonValue[],
            "posts",
            query(["_embed", "nope"]),
            document,
        );

        expect(post).toEqual({ id: "1", title: "a" });
    });

    test("several targets in one query all apply", () => {
        const wider: JsonObject = { ...document, likes: [{ id: "1", postId: "1" }] };
        const [post] = applyEmbeds(
            wider.posts as JsonValue[],
            "posts",
            query(["_embed", "comments,likes"]),
            wider,
        );

        expect((post as JsonObject).comments).toHaveLength(1);
        expect((post as JsonObject).likes).toHaveLength(1);
    });

    test("no _embed leaves the records identical", () => {
        const records = document.posts as JsonValue[];

        expect(applyEmbeds(records, "posts", query(), document)).toBe(records);
    });
});

/** Nothing outside this list may be spelled as an operator. */
describe("CONDITION_OPERATORS", () => {
    test("is the exact set json-server v1 documents", () => {
        expect([...CONDITION_OPERATORS]).toEqual([
            "eq",
            "ne",
            "lt",
            "lte",
            "gt",
            "gte",
            "in",
            "contains",
            "startsWith",
            "endsWith",
        ] satisfies ConditionOperator[]);
    });
});
