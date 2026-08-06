import { describe, expect, test } from "bun:test";
import { getOperationAST, parse } from "graphql";

import {
    MAX_QUERY_DEPTH,
    MAX_QUERY_LENGTH,
    MAX_ROOT_FIELDS,
} from "@/modules/graphql-server/domain/constants";
import { executeRequest, planRequest } from "@/modules/graphql-server/domain/execute";
import { analyzeOperation } from "@/modules/graphql-server/domain/guard";
import type { GraphqlRequest } from "@/modules/graphql-server/types";
import type { JsonDocument } from "@/modules/tools/types/json-document";

/**
 * The three bounds a public GraphQL endpoint cannot ship without.
 *
 * Each catches a shape the other two miss, so each is tested for the shape it
 * owns *and* for not refusing the ordinary query the other two would.
 */

const DB: JsonDocument = {
    posts: [{ id: "1", title: "a" }],
    comments: [{ id: "1", postId: "1" }],
};

function analyze(query: string, variables: Record<string, unknown> | null = null) {
    const ast = parse(query);
    const operation = getOperationAST(ast);

    if (operation === null || operation === undefined) {
        throw new Error("no operation");
    }

    return analyzeOperation(ast, operation, variables);
}

function serve(query: string, variables: Record<string, unknown> | null = null) {
    const request: GraphqlRequest = {
        query,
        variables,
        operationName: null,
        allowMutation: true,
    };
    const plan = planRequest(request);

    if (!plan.ok) {
        return { status: 400, code: plan.reason.toUpperCase() };
    }

    const outcome = executeRequest(plan, request, DB, 0);
    const parsed = JSON.parse(outcome.body) as {
        errors?: { extensions?: { code?: string } }[];
    };

    return { status: outcome.status, code: parsed.errors?.[0].extensions?.code };
}

/**
 * Nests `post { comments { post { … } } }` to a given depth.
 *
 * Built outside-in, because the alternation is fixed by the schema rather than
 * chosen: under a `Post` the only relation is `comments`, and under a `Comment`
 * the only one is `post`. Getting that backwards produces a query that fails
 * validation for naming a field that does not exist, which looks exactly like
 * the depth refusal this is meant to be testing.
 */
function nest(levels: number): string {
    const fields: string[] = [];

    for (let level = 0; level < levels; level += 1) {
        fields.push(level % 2 === 0 ? "comments" : "post");
    }

    let inner = "id";

    for (const field of fields.toReversed()) {
        inner = `${field} { ${inner} }`;
    }

    return `{ post(id: "1") { ${inner} } }`;
}

describe("depth", () => {
    test("an ordinary two-level query passes", () => {
        expect(analyze(`{ posts { id comments { id } } }`).ok).toBe(true);
    });

    test("a cycle deeper than the ceiling is refused", () => {
        // Relations here are cyclic by construction — a post has comments and
        // every comment has a post — so nothing but a depth bound stops this.
        expect(serve(nest(MAX_QUERY_DEPTH + 4))).toEqual({
            status: 400,
            code: "TOO_DEEP",
        });
    });

    test("a fragment spread is not a level of its own", () => {
        const flat = analyze(`{ posts { id title } }`);
        const viaFragment = analyze(`{ posts { ...f } } fragment f on Post { id title }`);

        expect(viaFragment.analysis.depth).toBe(flat.analysis.depth);
    });

    test("depth is measured through a fragment, not around it", () => {
        // A bound a fragment could hide behind would be no bound at all.
        const inline = analyze(`{ posts { comments { post { id } } } }`);
        const spread = analyze(
            `{ posts { ...a } } fragment a on Post { comments { ...b } } fragment b on Comment { post { id } }`,
        );

        expect(spread.analysis.depth).toBe(inline.analysis.depth);
    });
});

describe("cost", () => {
    test("a leaf field costs one per object it appears on", () => {
        // `posts` at the default page size, then two leaves on each.
        expect(analyze(`{ posts(perPage: 10) { id title } }`).analysis.cost).toBe(30);
    });

    test("each nested list multiplies rather than adds", () => {
        const shallow = analyze(`{ posts(perPage: 10) { id } }`).analysis.cost;
        const deep = analyze(`{ posts(perPage: 10) { comments(perPage: 10) { id } } }`).analysis
            .cost;

        expect(deep).toBeGreaterThan(shallow * 10);
    });

    test("a breadth-only query is refused even though it is shallow", () => {
        // Three levels deep and a million records. Depth alone would let it
        // through.
        expect(serve(`{ posts(perPage: 1000) { comments(perPage: 1000) { id } } }`)).toEqual({
            status: 400,
            code: "TOO_COSTLY",
        });
    });

    test("a page size passed as a variable is read, not assumed", () => {
        // A bound a variable could slip past would be no bound at all, and every
        // real client sends variables.
        expect(
            serve(`query ($n: Int) { posts(perPage: $n) { comments(perPage: $n) { id } } }`, {
                n: 1000,
            }),
        ).toEqual({ status: 400, code: "TOO_COSTLY" });
    });

    test("a small explicit page size costs less than the default", () => {
        expect(analyze(`{ posts(perPage: 1) { id } }`).analysis.cost).toBeLessThan(
            analyze(`{ posts { id } }`).analysis.cost,
        );
    });

    test("introspection is exempt, so an IDE can read the schema", () => {
        expect(analyze(`{ __schema { types { fields { name } } } }`).analysis.cost).toBe(1);
    });
});

describe("root fields", () => {
    test("aliasing one field many times is counted separately", () => {
        const aliases = Array.from(
            { length: MAX_ROOT_FIELDS + 1 },
            (_unused, index) => `a${index}: posts { id }`,
        ).join(" ");

        expect(serve(`{ ${aliases} }`)).toEqual({
            status: 400,
            code: "TOO_MANY_ROOT_FIELDS",
        });
    });

    test("a fragment at the root is expanded rather than counted as one", () => {
        const fields = Array.from(
            { length: MAX_ROOT_FIELDS + 1 },
            (_unused, index) => `a${index}: posts { id }`,
        ).join(" ");

        expect(
            analyze(`{ ...many } fragment many on Query { ${fields} }`).analysis.rootFields,
        ).toBe(MAX_ROOT_FIELDS + 1);
    });

    test("an ordinary handful of root fields passes", () => {
        expect(analyze(`{ posts { id } comments { id } }`).analysis.rootFields).toBe(2);
    });
});

describe("length", () => {
    test("a query past the ceiling is refused before it is parsed", () => {
        expect(serve(`{ posts { id ${"a".repeat(MAX_QUERY_LENGTH)} } }`)).toEqual({
            status: 400,
            code: "QUERY_TOO_LONG",
        });
    });
});

describe("fragment cycles", () => {
    test("a self-spreading fragment is refused by validation, not by hanging", () => {
        // The guard's walker follows spreads, so it would not terminate on this.
        // Validation runs first for exactly that reason — this test is what
        // proves the ordering has not been swapped.
        expect(serve(`{ posts { ...a } } fragment a on Post { ...a }`).status).toBe(400);
    });

    test("exponential fragment expansion is refused, and quickly", () => {
        // Thirty acyclic fragments, each spreading the next twice: 2³⁰ visits if
        // the walk is unbounded, which is the analysis itself becoming the
        // denial of service it exists to prevent. Nothing here is cyclic, so
        // `NoFragmentCycles` does not catch it and the depth bound does not
        // either — a spread adds no depth.
        const fragments = Array.from({ length: 30 }, (_unused, index) =>
            index === 29
                ? `fragment f${index} on Post { id }`
                : `fragment f${index} on Post { ...f${index + 1} ...f${index + 1} }`,
        ).join(" ");

        const startedAt = Date.now();
        const result = serve(`{ posts { ...f0 } } ${fragments}`);

        expect(result.status).toBe(400);
        expect(result.code).toBe("TOO_COSTLY");
        // Generous, so this measures "did not blow up" rather than machine speed.
        expect(Date.now() - startedAt).toBeLessThan(5_000);
    });
});
