import { describe, expect, test } from "bun:test";

import { inferFields } from "@/modules/graphql-server/domain/infer";
import { buildSchemaModel } from "@/modules/graphql-server/domain/schema-model";
import type { CollectionModel, SingularModel } from "@/modules/graphql-server/types";
import type { JsonDocument, JsonObject } from "@/modules/tools/types/json-document";

/** `json-server`'s own README fixture — the shape to get right. */
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

function collection(document: JsonDocument, resource: string): CollectionModel {
    const found = buildSchemaModel(document).resources.find((entry) => entry.resource === resource);

    if (found === undefined || found.kind !== "collection") {
        throw new Error(`${resource} is not a collection in this model`);
    }

    return found;
}

describe("inferFields", () => {
    test("reads the ordinary scalars", () => {
        const fields = inferFields([{ id: "1", title: "a", views: 100, ratio: 1.5, draft: false }]);
        const byName = new Map(fields.map((field) => [field.name, field.type]));

        expect(byName.get("id")).toEqual({
            scalar: "ID",
            list: false,
            nullable: false,
            itemsNullable: false,
        });
        expect(byName.get("title")?.scalar).toBe("String");
        expect(byName.get("views")?.scalar).toBe("Int");
        expect(byName.get("ratio")?.scalar).toBe("Float");
        expect(byName.get("draft")?.scalar).toBe("Boolean");
    });

    test("an integer past GraphQL's 32-bit Int is a Float", () => {
        // GraphQL's `Int` is explicitly a signed 32-bit integer, so serialising
        // a larger value through it is an error at response time — a field that
        // works for ten thousand records and then throws.
        const fields = inferFields([{ id: "1", big: 9_000_000_000 }]);

        expect(fields.find((field) => field.name === "big")?.type.scalar).toBe("Float");
    });

    test("Int and Float in one field widen to Float", () => {
        const fields = inferFields([
            { id: "1", n: 1 },
            { id: "2", n: 1.5 },
        ]);

        expect(fields.find((field) => field.name === "n")?.type.scalar).toBe("Float");
    });

    test("two incompatible scalars collapse to JSON, not to the wider one", () => {
        const fields = inferFields([
            { id: "1", mixed: "text" },
            { id: "2", mixed: 4 },
        ]);

        expect(fields.find((field) => field.name === "mixed")?.type.scalar).toBe("JSON");
    });

    test("a nested object is JSON rather than a generated nested type", () => {
        const fields = inferFields([{ id: "1", author: { name: "typicode" } }]);

        expect(fields.find((field) => field.name === "author")?.type.scalar).toBe("JSON");
    });

    test("a field absent from any record is nullable", () => {
        const fields = inferFields([{ id: "1", title: "a" }, { id: "2" }]);

        expect(fields.find((field) => field.name === "title")?.type.nullable).toBe(true);
    });

    test("a field present and non-null everywhere is non-null", () => {
        const fields = inferFields([
            { id: "1", title: "a" },
            { id: "2", title: "b" },
        ]);

        expect(fields.find((field) => field.name === "title")?.type.nullable).toBe(false);
    });

    test("an explicit null makes a field nullable even when the key is always there", () => {
        const fields = inferFields([
            { id: "1", title: "a" },
            { id: "2", title: null },
        ]);

        expect(fields.find((field) => field.name === "title")?.type.nullable).toBe(true);
    });

    test("a field that is a list everywhere is a list", () => {
        const fields = inferFields([{ id: "1", tags: ["a", "b"] }]);
        const type = fields.find((field) => field.name === "tags")?.type;

        expect(type?.list).toBe(true);
        expect(type?.scalar).toBe("String");
    });

    test("a null inside a list makes the items nullable", () => {
        const fields = inferFields([{ id: "1", tags: ["a", null] }]);

        expect(fields.find((field) => field.name === "tags")?.type.itemsNullable).toBe(true);
    });

    test("a key that is a list in one record and a value in another is JSON, not a list", () => {
        const fields = inferFields([
            { id: "1", tag: ["a"] },
            { id: "2", tag: "b" },
        ]);
        const type = fields.find((field) => field.name === "tag")?.type;

        expect(type?.scalar).toBe("JSON");
        expect(type?.list).toBe(false);
    });

    test("every value being null leaves the field JSON and nullable", () => {
        const fields = inferFields([{ id: "1", unknown: null }]);
        const type = fields.find((field) => field.name === "unknown")?.type;

        expect(type?.scalar).toBe("JSON");
        expect(type?.nullable).toBe(true);
    });

    test("reads every record rather than a sample", () => {
        // Inference from a sample would call this `Int` and then fail to
        // serialise the record that contradicts it. Two hundred records puts the
        // odd one well past any plausible sample window.
        const records: JsonObject[] = Array.from({ length: 200 }, (_unused, index) => ({
            id: String(index + 1),
            n: index === 199 ? 1.5 : index,
        }));

        expect(inferFields(records).find((field) => field.name === "n")?.type.scalar).toBe("Float");
    });

    test("id comes first whatever order the record was written in", () => {
        const fields = inferFields([{ title: "a", id: "1" }]);

        expect(fields[0].name).toBe("id");
    });

    test("a key GraphQL forbids is published under a repaired name", () => {
        const fields = inferFields([{ id: "1", "full-name": "Ada" }]);
        const repaired = fields.find((field) => field.sourceKey === "full-name");

        expect(repaired?.name).toBe("fullName");
    });
});

describe("buildSchemaModel", () => {
    test("a collection becomes a type, a list field, a single field and four mutations", () => {
        const posts = collection(README_DB, "posts");

        expect(posts.typeName).toBe("Post");
        expect(posts.listField).toBe("posts");
        expect(posts.singleField).toBe("post");
        expect(posts.connectionField).toBe("postsConnection");
        expect(posts.mutations).toEqual({
            create: "createPost",
            update: "updatePost",
            patch: "patchPost",
            remove: "deletePost",
        });
        expect(posts.recordCount).toBe(2);
    });

    test("a lone object is singular: a type, one query field, no create or delete", () => {
        const model = buildSchemaModel(README_DB);
        const profile = model.resources.find((entry) => entry.resource === "profile") as
            SingularModel | undefined;

        expect(profile?.kind).toBe("singular");
        expect(profile?.typeName).toBe("Profile");
        expect(profile?.queryField).toBe("profile");
        expect(profile?.mutations).toEqual({ update: "updateProfile", patch: "patchProfile" });
    });

    test("anything else is opaque: one JSON field and nothing more", () => {
        const model = buildSchemaModel({ tags: ["a", "b"], count: 3 });

        expect(model.resources.map((entry) => entry.kind)).toEqual(["opaque", "opaque"]);
    });

    test("an empty array is a collection, so the first record can be created", () => {
        // Reading `{"posts": []}` as opaque would leave somebody unable to add
        // the first record to a server they created for exactly that.
        expect(collection({ posts: [] }, "posts").listField).toBe("posts");
    });

    test("an empty collection still publishes id, because a fieldless type will not parse", () => {
        // Found by the SDL round trip: `{"posts": []}` is the most natural way
        // to start a server you intend to mutate into, and without this it
        // produced `type Post {}` — a GraphQL syntax error, so the endpoint
        // would refuse every request including introspection.
        expect(collection({ posts: [] }, "posts").fields).toEqual([
            {
                name: "id",
                sourceKey: "id",
                type: { scalar: "ID", list: false, nullable: false, itemsNullable: false },
            },
        ]);
    });

    test("an object with no keys is published as opaque rather than a fieldless type", () => {
        // Same failure from the other direction, and it cannot be fixed the same
        // way: a lone object has no id to fall back on.
        const model = buildSchemaModel({ profile: {} });

        expect(model.resources).toEqual([
            { kind: "opaque", resource: "profile", queryField: "profile" },
        ]);
        expect(model.skipped).toEqual([{ resource: "profile", reason: "no_fields" }]);
    });

    test("an empty object does not reserve the type name it never publishes", () => {
        // `a` would otherwise claim `A` and push `as` — which singularises onto
        // the same name — to `A2` for no reason a reader could see.
        const model = buildSchemaModel({ a: {}, as: [{ id: "1" }] });

        expect(collection({ a: {}, as: [{ id: "1" }] }, "as").typeName).toBe("A");
        expect(model.skipped).toEqual([{ resource: "a", reason: "no_fields" }]);
    });

    test("both directions of a foreign key are published", () => {
        const model = buildSchemaModel(README_DB);
        const comments = model.resources.find(
            (entry) => entry.resource === "comments",
        ) as CollectionModel;
        const posts = model.resources.find(
            (entry) => entry.resource === "posts",
        ) as CollectionModel;

        expect(comments.relations).toEqual([
            {
                name: "post",
                cardinality: "one",
                targetResource: "posts",
                targetType: "Post",
                foreignKey: "postId",
            },
        ]);
        expect(posts.relations).toEqual([
            {
                name: "comments",
                cardinality: "many",
                targetResource: "comments",
                targetType: "Comment",
                foreignKey: "postId",
            },
        ]);
    });

    test("a foreign key pointing at no collection publishes nothing", () => {
        const model = buildSchemaModel({
            comments: [{ id: "1", ghostId: "9" }],
        });
        const comments = model.resources[0] as CollectionModel;

        expect(comments.relations).toEqual([]);
    });

    test("a relation never shadows a stored field", () => {
        // The document is the source of truth. Publishing a derived `post` over
        // a stored one would make the stored value unreachable.
        const model = buildSchemaModel({
            posts: [{ id: "1" }],
            comments: [{ id: "1", postId: "1", post: "a stored value" }],
        });
        const comments = model.resources.find(
            (entry) => entry.resource === "comments",
        ) as CollectionModel;

        expect(comments.relations).toEqual([]);
    });

    test("a self-referencing foreign key is skipped", () => {
        const model = buildSchemaModel({ posts: [{ id: "1", postId: "1" }] });

        expect((model.resources[0] as CollectionModel).relations).toEqual([]);
    });

    test("a key GraphQL cannot name is skipped and reported, never dropped silently", () => {
        const model = buildSchemaModel({ "a/b": [{ id: "1" }], posts: [{ id: "1" }] });

        expect(model.skipped).toEqual([{ resource: "a/b", reason: "unroutable_name" }]);
        expect(model.resources).toHaveLength(1);
    });

    test("a repaired name is reported", () => {
        const model = buildSchemaModel({ "blog-posts": [{ id: "1" }] });

        expect(model.renamed).toContainEqual({
            resource: "blog-posts",
            published: "blogPosts",
            reason: "invalid_characters",
        });
    });

    test("two keys wanting one type name are both published, suffixed", () => {
        // Dropping one would lose a resource silently; suffixing is visible, and
        // the studio prints it beside the resource it belongs to.
        const model = buildSchemaModel({ posts: [{ id: "1" }], post: [{ id: "1" }] });
        const types = model.resources.map((entry) =>
            entry.kind === "opaque" ? null : entry.typeName,
        );

        expect(types).toEqual(["Post", "Post2"]);
    });

    test("a resource may not take a name the schema already owns", () => {
        const model = buildSchemaModel({ queries: [{ id: "1" }] });

        // `Query` is the root type. A collection called `queries` singularises
        // straight onto it, and shadowing the root would make the schema invalid.
        expect((model.resources[0] as CollectionModel).typeName).toBe("Query2");
    });

    test("is deterministic in the document's key order", () => {
        const once = JSON.stringify(buildSchemaModel(README_DB));
        const twice = JSON.stringify(buildSchemaModel(README_DB));

        expect(once).toBe(twice);
    });

    test("an empty document publishes nothing and says so", () => {
        expect(buildSchemaModel({}).isEmpty).toBe(true);
    });
});
