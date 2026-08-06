import { describe, expect, test } from "bun:test";
import {
    buildSchema as buildFromSdl,
    lexicographicSortSchema,
    parse,
    print,
    printSchema,
    visit,
    type GraphQLSchema,
} from "graphql";

import { buildSchemaModel } from "@/modules/graphql-server/domain/schema-model";
import { buildSchema } from "@/modules/graphql-server/domain/schema-build";
import { renderSdl } from "@/modules/graphql-server/domain/sdl";
import type { JsonDocument } from "@/modules/tools/types/json-document";

/**
 * The SDL, checked against something that is not the thing that wrote it.
 *
 * `renderSdl` is a hand-written printer, and it exists that way for a real
 * reason: its output is shown in the studio and offered as a `schema.graphql`
 * download, so it has to be producible without pulling `graphql-js` into the
 * client bundle. That leaves the obvious failure mode — a printer that agrees
 * with itself and with nothing else, producing a file that looks like SDL and
 * that no other tool can read.
 *
 * So every case here does the round trip the QR encoder and the ICO writer do:
 * take the model, print it, parse the printed text with **`graphql-js`'s own
 * parser**, and compare the result with the schema `buildSchema` constructs
 * directly from the same model. If the two disagree about a single field or a
 * single nullability marker, this goes red — which is precisely the drift that
 * would otherwise ship as "the SDL on the page does not match the API".
 */

const README_DB: JsonDocument = {
    posts: [
        { id: "1", title: "a title", views: 100 },
        { id: "2", title: "another title", views: 200 },
    ],
    comments: [
        { id: "1", text: "a comment about post 1", postId: "1" },
        { id: "2", text: "another comment about post 1", postId: "1" },
    ],
    profile: { name: "typicode" },
};

/**
 * Both schemas, reduced to one canonical form.
 *
 * Putting *both* through the reference printer is what makes the comparison
 * meaningful — comparing our text with its text would only be comparing two
 * formatting conventions.
 *
 * Two normalisations, and neither is optional. **`lexicographicSortSchema`**,
 * because the two constructions populate the type map in different orders and a
 * schema is a set of types rather than a list. **Descriptions stripped**, at the
 * AST rather than by dropping lines that start with a quote — a block string's
 * body does not, so the line filter left the prose in and made every case fail
 * for the one reason that does not matter. Descriptions are documentation; the
 * contract is the types, the fields, the arguments and the nullability.
 */
function bothSchemas(document: JsonDocument): { ours: string; direct: string } {
    const model = buildSchemaModel(document);

    return {
        ours: normalize(buildFromSdl(renderSdl(model))),
        direct: normalize(buildSchema(model)),
    };
}

function normalize(schema: GraphQLSchema): string {
    const sorted = printSchema(lexicographicSortSchema(schema));

    return print(
        visit(parse(sorted), {
            enter(node) {
                return "description" in node && node.description !== undefined
                    ? { ...node, description: undefined }
                    : undefined;
            },
        }),
    );
}

describe("renderSdl parses as GraphQL and matches the executed schema", () => {
    const cases: readonly (readonly [string, JsonDocument])[] = [
        ["the README fixture", README_DB],
        ["a lone collection", { posts: [{ id: "1", title: "a" }] }],
        ["a lone singular object", { profile: { name: "typicode" } }],
        ["an opaque array", { tags: ["a", "b"] }],
        ["an opaque scalar", { count: 3 }],
        ["an empty collection", { posts: [] }],
        ["an object with no keys", { profile: {} }],
        ["an empty collection beside a full one", { posts: [], comments: [{ id: "1" }] }],
        ["a collection of nothing but ids", { posts: [{ id: "1" }] }],
        [
            "every scalar shape",
            {
                things: [
                    {
                        id: "1",
                        text: "a",
                        whole: 1,
                        fractional: 1.5,
                        flag: true,
                        nested: { a: 1 },
                        list: ["a", "b"],
                        big: 9_000_000_000,
                    },
                    { id: "2", text: null },
                ],
            },
        ],
        ["a repaired field name", { people: [{ id: "1", "full-name": "Ada" }] }],
        ["a repaired resource name", { "blog-posts": [{ id: "1", title: "a" }] }],
        ["a numeric resource name", { "2024": [{ id: "1" }] }],
        ["colliding type names", { posts: [{ id: "1" }], post: [{ id: "1" }] }],
        ["a name the schema reserves", { queries: [{ id: "1" }] }],
        [
            "a relation in both directions",
            {
                posts: [{ id: "1" }],
                comments: [{ id: "1", postId: "1" }],
            },
        ],
        [
            "a relation whose reverse name is taken",
            {
                posts: [{ id: "1", comments: "a stored value" }],
                comments: [{ id: "1", postId: "1" }],
            },
        ],
        [
            "an unpublishable key beside a good one",
            {
                "a/b": [{ id: "1" }],
                posts: [{ id: "1" }],
            },
        ],
        ["an empty document", {}],
    ];

    for (const [name, document] of cases) {
        test(name, () => {
            const { ours, direct } = bothSchemas(document);

            expect(ours).toBe(direct);
        });
    }
});

describe("the printed text itself", () => {
    test("carries the custom scalar and the shared filter inputs", () => {
        const sdl = renderSdl(buildSchemaModel(README_DB));

        expect(sdl).toContain("scalar JSON");
        expect(sdl).toContain("input StringFilter");
        expect(sdl).toContain("input IntFilter");
        expect(sdl).toContain("enum OrderDirection");
    });

    test("marks a field present everywhere as non-null and an absent one as nullable", () => {
        const sdl = renderSdl(buildSchemaModel({ posts: [{ id: "1", always: "a" }, { id: "2" }] }));

        expect(sdl).toContain("id: ID!");
        expect(sdl).toContain("always: String");
        expect(sdl).not.toContain("always: String!");
    });

    test("a list of non-null items in a non-null list", () => {
        const sdl = renderSdl(buildSchemaModel({ posts: [{ id: "1", tags: ["a"] }] }));

        expect(sdl).toContain("tags: [String!]!");
    });

    test("names the id as optional on create and absent from update", () => {
        const sdl = renderSdl(buildSchemaModel({ posts: [{ id: "1", title: "a" }] }));
        const createInput = sdl.slice(sdl.indexOf("input PostCreateInput"));
        const updateInput = sdl.slice(sdl.indexOf("input PostUpdateInput"));

        expect(createInput.slice(0, createInput.indexOf("}"))).toContain("id: ID");
        expect(updateInput.slice(0, updateInput.indexOf("}"))).not.toContain("id: ID");
    });

    test("an empty document prints a schema that parses and says what to do", () => {
        const sdl = renderSdl(buildSchemaModel({}));

        expect(() => buildFromSdl(sdl)).not.toThrow();
        expect(sdl).toContain("Add a collection");
    });

    test("is deterministic, so a checked-in schema file does not churn", () => {
        expect(renderSdl(buildSchemaModel(README_DB))).toBe(renderSdl(buildSchemaModel(README_DB)));
    });
});
