import { describe, expect, test } from "bun:test";
import { parse } from "graphql";

import { executeRequest, planRequest } from "@/modules/graphql-server/domain/execute";
import { buildSchemaModel } from "@/modules/graphql-server/domain/schema-model";
import { buildStarterQuery } from "@/modules/graphql-server/domain/starter";
import type { JsonDocument } from "@/modules/tools/types/json-document";

/**
 * The starter query exists so a fresh endpoint is not a blank box above
 * something that rejects every empty request. That only works if it actually
 * runs — a generated example that errors is worse than none, because it teaches
 * a reader that the tool is broken before they have written anything.
 *
 * So every case here parses it *and* executes it against the document it was
 * derived from, and asserts there were no errors.
 */

function runStarter(document: JsonDocument) {
    const query = buildStarterQuery(buildSchemaModel(document));
    const request = { query, variables: null, operationName: null, allowMutation: false };
    const plan = planRequest(request);

    if (!plan.ok) {
        throw new Error(`the starter query did not plan: ${plan.message}`);
    }

    const outcome = executeRequest(plan, request, document, 0);

    return { query, ...(JSON.parse(outcome.body) as { data?: unknown; errors?: unknown[] }) };
}

const README_DB: JsonDocument = {
    posts: [{ id: "1", title: "a title", views: 100 }],
    comments: [{ id: "1", text: "a comment", postId: "1" }],
    profile: { name: "typicode" },
};

describe("buildStarterQuery", () => {
    const documents: readonly (readonly [string, JsonDocument])[] = [
        ["the README fixture", README_DB],
        ["a lone collection", { posts: [{ id: "1", title: "a" }] }],
        ["an empty collection", { posts: [] }],
        ["a collection of nothing but ids", { posts: [{ id: "1" }] }],
        ["only a singular object", { profile: { name: "typicode" } }],
        ["only an opaque value", { tags: ["a", "b"] }],
        ["only nested JSON fields", { posts: [{ id: "1", meta: { a: 1 } }] }],
        ["a repaired field name", { people: [{ id: "1", "full-name": "Ada" }] }],
        ["an empty document", {}],
    ];

    for (const [name, document] of documents) {
        test(`runs against ${name}`, () => {
            const result = runStarter(document);

            expect(() => parse(result.query)).not.toThrow();
            expect(result.errors).toBeUndefined();
        });
    }

    test("leads with the connection, so the first thing shown is the total", () => {
        expect(buildStarterQuery(buildSchemaModel(README_DB))).toContain("postsConnection");
        expect(buildStarterQuery(buildSchemaModel(README_DB))).toContain("total");
    });

    test("includes a relation where there is one, which is the reason to be here", () => {
        expect(buildStarterQuery(buildSchemaModel(README_DB))).toContain("comments");
    });

    test("is deterministic, so the editor does not shuffle between two loads", () => {
        expect(buildStarterQuery(buildSchemaModel(README_DB))).toBe(
            buildStarterQuery(buildSchemaModel(README_DB)),
        );
    });

    test("an empty document gets a query that says what to do", () => {
        expect(buildStarterQuery(buildSchemaModel({}))).toContain("publishes nothing queryable");
    });
});
