import { describe, expect, test } from "bun:test";

import {
    isPublishableFieldName,
    pluralize,
    singularize,
    toFieldName,
    toTypeName,
    uniqueName,
} from "@/modules/graphql-server/domain/naming";

/**
 * The inflector matters more here than in the REST studio, where a wrong guess
 * costs one empty `_embed`. A wrong guess here is a **published type name** — it
 * goes into the SDL, into introspection, and into whatever codegen wrote from
 * it. So the irregulars are pinned, and so is every case where the naive rule
 * would have been wrong.
 */

describe("singularize", () => {
    test("drops a plain trailing s", () => {
        expect(singularize("posts")).toBe("post");
        expect(singularize("comments")).toBe("comment");
        expect(singularize("users")).toBe("user");
    });

    test("`-ies` after a consonant becomes `-y`", () => {
        expect(singularize("categories")).toBe("category");
        expect(singularize("companies")).toBe("company");
        expect(singularize("stories")).toBe("story");
    });

    test("`-ies` after a vowel is an irregular, not a `-y`", () => {
        // The naive rule turns these into `movy` and `zombie` respectively, and
        // both would ship into somebody's generated client.
        expect(singularize("movies")).toBe("movie");
    });

    test("the sibilant plurals drop `es`, not `s`", () => {
        expect(singularize("addresses")).toBe("address");
        expect(singularize("boxes")).toBe("box");
        expect(singularize("batches")).toBe("batch");
        expect(singularize("dishes")).toBe("dish");
        expect(singularize("quizzes")).toBe("quiz");
    });

    test("`ss` is not a plural marker", () => {
        expect(singularize("address")).toBe("address");
        expect(singularize("class")).toBe("class");
    });

    test("carries the irregulars a suffix rule cannot reach", () => {
        expect(singularize("people")).toBe("person");
        expect(singularize("children")).toBe("child");
        expect(singularize("men")).toBe("man");
        expect(singularize("women")).toBe("woman");
        expect(singularize("mice")).toBe("mouse");
        expect(singularize("indices")).toBe("index");
        expect(singularize("lives")).toBe("life");
        expect(singularize("leaves")).toBe("leaf");
        expect(singularize("criteria")).toBe("criterion");
    });

    test("leaves the uncountables alone", () => {
        // Every one of these becomes something absurd under "drop a trailing s".
        expect(singularize("series")).toBe("series");
        expect(singularize("species")).toBe("species");
        expect(singularize("news")).toBe("news");
        expect(singularize("data")).toBe("data");
        expect(singularize("status")).toBe("status");
        expect(singularize("settings")).toBe("setting");
    });

    test("preserves the case it was given", () => {
        expect(singularize("Posts")).toBe("Post");
        expect(singularize("POSTS")).toBe("POST");
        expect(singularize("blogPosts")).toBe("blogPost");
    });

    test("an already-singular word is returned unchanged", () => {
        expect(singularize("post")).toBe("post");
        expect(singularize("profile")).toBe("profile");
    });
});

describe("pluralize", () => {
    test("round-trips with singularize on the ordinary shapes", () => {
        for (const plural of ["posts", "comments", "categories", "boxes", "people", "children"]) {
            expect(pluralize(singularize(plural))).toBe(plural);
        }
    });

    test("adds `es` after a sibilant", () => {
        expect(pluralize("box")).toBe("boxes");
        expect(pluralize("batch")).toBe("batches");
        expect(pluralize("dish")).toBe("dishes");
    });

    test("`-y` after a consonant becomes `-ies`", () => {
        expect(pluralize("category")).toBe("categories");
    });

    test("`-y` after a vowel takes a plain s", () => {
        expect(pluralize("day")).toBe("days");
    });
});

describe("toFieldName", () => {
    test("leaves a name GraphQL already accepts exactly as written", () => {
        expect(toFieldName("posts")).toBe("posts");
        // Underscores are legal GraphQL. Camel-casing them would be this tool
        // deciding it knows better than whoever named the key.
        expect(toFieldName("blog_posts")).toBe("blog_posts");
        expect(toFieldName("Posts2")).toBe("Posts2");
    });

    test("a hyphen becomes a camel hump, because GraphQL has no hyphen at all", () => {
        expect(toFieldName("blog-posts")).toBe("blogPosts");
        expect(toFieldName("a-b-c")).toBe("aBC");
    });

    test("a leading digit gains an underscore", () => {
        expect(toFieldName("2024")).toBe("_2024");
        expect(toFieldName("1st-place")).toBe("_1stPlace");
    });

    test("returns null when nothing usable is left", () => {
        expect(toFieldName("")).toBeNull();
        expect(toFieldName("---")).toBeNull();
    });

    test("refuses the introspection prefix the specification reserves", () => {
        expect(toFieldName("__schema")).toBeNull();
    });
});

describe("toTypeName", () => {
    test("PascalCase and singular", () => {
        expect(toTypeName("posts")).toBe("Post");
        expect(toTypeName("comments")).toBe("Comment");
        expect(toTypeName("categories")).toBe("Category");
        expect(toTypeName("people")).toBe("Person");
    });

    test("joins the parts of a snake-cased key", () => {
        expect(toTypeName("blog_posts")).toBe("BlogPost");
    });

    test("repairs a hyphen on the way through", () => {
        expect(toTypeName("blog-posts")).toBe("BlogPost");
    });

    test("a singular key keeps its own word", () => {
        expect(toTypeName("profile")).toBe("Profile");
    });
});

describe("uniqueName", () => {
    test("returns the wanted name when it is free", () => {
        expect(uniqueName("Post", new Set())).toBe("Post");
    });

    test("suffixes from 2 upward, deterministically", () => {
        expect(uniqueName("Post", new Set(["Post"]))).toBe("Post2");
        expect(uniqueName("Post", new Set(["Post", "Post2"]))).toBe("Post3");
    });
});

describe("isPublishableFieldName", () => {
    test("accepts GraphQL's own Name grammar", () => {
        expect(isPublishableFieldName("title")).toBe(true);
        expect(isPublishableFieldName("_private")).toBe(true);
        expect(isPublishableFieldName("a1")).toBe(true);
    });

    test("rejects what the grammar does not admit", () => {
        expect(isPublishableFieldName("full-name")).toBe(false);
        expect(isPublishableFieldName("1st")).toBe(false);
        expect(isPublishableFieldName("__typename")).toBe(false);
        expect(isPublishableFieldName("")).toBe(false);
    });
});
