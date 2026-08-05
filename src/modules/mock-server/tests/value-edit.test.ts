import { describe, expect, test } from "bun:test";

import {
    addFieldAt,
    addOptionAt,
    changeKind,
    defaultValueFor,
    duplicateFieldAt,
    fromJson,
    isAllStatic,
    moveFieldAt,
    pathKey,
    readAt,
    removeFieldAt,
    removeOptionAt,
    renameFieldAt,
    toJson,
    writeAt,
    type ValuePath,
} from "@/modules/mock-server/domain/value-edit";
import { VALUE_KINDS, type ValueExpr } from "@/modules/mock-server/types/graph";

const ROOT: ValueExpr = {
    kind: "object",
    fields: [
        { key: "id", value: { kind: "uuid" } },
        {
            key: "profile",
            value: {
                kind: "object",
                fields: [
                    { key: "city", value: { kind: "static", value: "Dhaka" } },
                    {
                        key: "tags",
                        value: {
                            kind: "array",
                            of: { kind: "static", value: "x" },
                            count: { kind: "fixed", n: 2 },
                        },
                    },
                ],
            },
        },
    ],
};

const PROFILE: ValuePath = [{ kind: "field", index: 1 }];
const TAGS: ValuePath = [
    { kind: "field", index: 1 },
    { kind: "field", index: 1 },
];

describe("readAt", () => {
    test("returns the root for an empty path", () => {
        expect(readAt(ROOT, [])).toBe(ROOT);
    });

    test("descends into an object field", () => {
        expect(readAt(ROOT, [{ kind: "field", index: 0 }])).toEqual({ kind: "uuid" });
    });

    test("descends two levels", () => {
        expect(readAt(ROOT, [...PROFILE, { kind: "field", index: 0 }])).toEqual({
            kind: "static",
            value: "Dhaka",
        });
    });

    test("descends into an array's item template", () => {
        expect(readAt(ROOT, [...TAGS, { kind: "of" }])).toEqual({ kind: "static", value: "x" });
    });

    test("misses an index past the end", () => {
        expect(readAt(ROOT, [{ kind: "field", index: 9 }])).toBeNull();
    });

    test("misses a step that does not fit the node", () => {
        expect(readAt(ROOT, [{ kind: "of" }])).toBeNull();
    });

    test("misses a template part that is a literal string", () => {
        const template: ValueExpr = { kind: "template", parts: ["hi ", { kind: "uuid" }] };

        expect(readAt(template, [{ kind: "part", index: 0 }])).toBeNull();
        expect(readAt(template, [{ kind: "part", index: 1 }])).toEqual({ kind: "uuid" });
    });
});

describe("writeAt", () => {
    test("replaces the root", () => {
        expect(writeAt(ROOT, [], { kind: "uuid" })).toEqual({ kind: "uuid" });
    });

    test("replaces a nested value", () => {
        const next = writeAt(ROOT, [...PROFILE, { kind: "field", index: 0 }], { kind: "uuid" });

        expect(readAt(next, [...PROFILE, { kind: "field", index: 0 }])).toEqual({ kind: "uuid" });
    });

    test("leaves the rest of the tree alone", () => {
        const next = writeAt(ROOT, [...PROFILE, { kind: "field", index: 0 }], { kind: "uuid" });

        expect(readAt(next, [{ kind: "field", index: 0 }])).toEqual({ kind: "uuid" });
        expect(readAt(next, [...TAGS])).toEqual(readAt(ROOT, [...TAGS]));
    });

    /** Nothing may be mutated: React compares by reference to decide renders. */
    test("does not mutate the original", () => {
        const before = JSON.stringify(ROOT);
        writeAt(ROOT, [...PROFILE, { kind: "field", index: 0 }], { kind: "uuid" });

        expect(JSON.stringify(ROOT)).toBe(before);
    });

    test("writes into an array's item template", () => {
        const next = writeAt(ROOT, [...TAGS, { kind: "of" }], { kind: "uuid" });

        expect(readAt(next, [...TAGS, { kind: "of" }])).toEqual({ kind: "uuid" });
    });

    /**
     * A render and a click are separated by time, so a row can vanish while an
     * edit is in flight. Losing the edit beats losing the document.
     */
    test("returns the tree unchanged for a path that no longer fits", () => {
        expect(writeAt(ROOT, [{ kind: "field", index: 99 }], { kind: "uuid" })).toBe(ROOT);
    });
});

describe("object operations", () => {
    test("renames a key", () => {
        const next = renameFieldAt(ROOT, [], 0, "identifier");

        expect(next.kind === "object" && next.fields[0].key).toBe("identifier");
    });

    test("renaming keeps the value", () => {
        const next = renameFieldAt(ROOT, [], 0, "identifier");

        expect(next.kind === "object" && next.fields[0].value).toEqual({ kind: "uuid" });
    });

    test("appends a field", () => {
        const next = addFieldAt(ROOT, [], "email");

        expect(next.kind === "object" && next.fields).toHaveLength(3);
        expect(next.kind === "object" && next.fields[2].key).toBe("email");
    });

    test("appends into a nested object", () => {
        const next = addFieldAt(ROOT, PROFILE, "country");
        const profile = readAt(next, PROFILE);

        expect(profile?.kind === "object" && profile.fields).toHaveLength(3);
    });

    test("removes a field", () => {
        const next = removeFieldAt(ROOT, [], 0);

        expect(next.kind === "object" && next.fields.map((field) => field.key)).toEqual([
            "profile",
        ]);
    });

    test("removing an index that is not there changes nothing", () => {
        expect(removeFieldAt(ROOT, [], 9)).toEqual(ROOT);
    });

    describe("duplicate", () => {
        test("inserts the copy directly after the original", () => {
            const next = duplicateFieldAt(ROOT, [], 0);

            expect(next.kind === "object" && next.fields.map((field) => field.key)).toEqual([
                "id",
                "idCopy",
                "profile",
            ]);
        });

        test("copies the value", () => {
            const next = duplicateFieldAt(ROOT, [], 0);

            expect(next.kind === "object" && next.fields[1].value).toEqual({ kind: "uuid" });
        });

        /** A JSON object cannot hold one key twice, so a clash would lose data. */
        test("keeps stepping until the name is free", () => {
            const crowded: ValueExpr = {
                kind: "object",
                fields: [
                    { key: "id", value: { kind: "uuid" } },
                    { key: "idCopy", value: { kind: "uuid" } },
                    { key: "idCopy2", value: { kind: "uuid" } },
                ],
            };
            const next = duplicateFieldAt(crowded, [], 0);

            expect(next.kind === "object" && next.fields[1].key).toBe("idCopy3");
        });

        test("leaves a blank key blank", () => {
            const blank: ValueExpr = {
                kind: "object",
                fields: [{ key: "", value: { kind: "static", value: 1 } }],
            };
            const next = duplicateFieldAt(blank, [], 0);

            expect(next.kind === "object" && next.fields.map((field) => field.key)).toEqual([
                "",
                "",
            ]);
        });
    });

    describe("move", () => {
        test("moves a field down", () => {
            const next = moveFieldAt(ROOT, [], 0, 1);

            expect(next.kind === "object" && next.fields.map((field) => field.key)).toEqual([
                "profile",
                "id",
            ]);
        });

        test("moves a field up", () => {
            const next = moveFieldAt(ROOT, [], 1, -1);

            expect(next.kind === "object" && next.fields.map((field) => field.key)).toEqual([
                "profile",
                "id",
            ]);
        });

        test("refuses to move the first field up", () => {
            expect(moveFieldAt(ROOT, [], 0, -1)).toBe(ROOT);
        });

        test("refuses to move the last field down", () => {
            expect(moveFieldAt(ROOT, [], 1, 1)).toBe(ROOT);
        });

        test("moves inside a nested object", () => {
            const next = moveFieldAt(ROOT, PROFILE, 0, 1);
            const profile = readAt(next, PROFILE);

            expect(profile?.kind === "object" && profile.fields.map((field) => field.key)).toEqual([
                "tags",
                "city",
            ]);
        });
    });
});

describe("choice operations", () => {
    const choice: ValueExpr = {
        kind: "oneOf",
        options: [
            { kind: "static", value: "a" },
            { kind: "static", value: "b" },
        ],
    };

    test("adds an option", () => {
        const next = addOptionAt(choice, []);

        expect(next.kind === "oneOf" && next.options).toHaveLength(3);
    });

    test("removes an option", () => {
        const next = removeOptionAt(choice, [], 0);

        expect(next.kind === "oneOf" && next.options).toEqual([{ kind: "static", value: "b" }]);
    });

    /** An empty choice resolves to null — not a state a button should produce. */
    test("never removes the last option", () => {
        const single: ValueExpr = { kind: "oneOf", options: [{ kind: "static", value: "a" }] };

        expect(removeOptionAt(single, [], 0)).toBe(single);
    });
});

describe("defaultValueFor", () => {
    for (const kind of VALUE_KINDS) {
        test(`${kind} starts as something of that kind`, () => {
            expect(defaultValueFor(kind).kind).toBe(kind);
        });
    }

    /** Switching a row's kind must never leave a document that cannot be saved. */
    test("every default is immediately usable", () => {
        for (const kind of VALUE_KINDS) {
            expect(() => JSON.stringify(defaultValueFor(kind))).not.toThrow();
        }
    });
});

describe("changeKind", () => {
    test("returns the same expression when the kind is unchanged", () => {
        const expr = defaultValueFor("uuid");

        expect(changeKind(expr, "uuid")).toBe(expr);
    });

    test("switching scalar kinds replaces the value", () => {
        expect(changeKind({ kind: "uuid" }, "static")).toEqual({ kind: "static", value: "" });
    });

    /** "Make this a list" almost always means a list of what is already there. */
    test("an object becoming an array keeps the object as the item template", () => {
        const next = changeKind(ROOT, "array");

        expect(next.kind === "array" && next.of).toBe(ROOT);
    });
});

describe("fromJson", () => {
    test("turns a scalar into a static value", () => {
        expect(fromJson("hi")).toEqual({ kind: "static", value: "hi" });
    });

    /**
     * The trap that makes most code-view escape hatches one-way: pasting JSON
     * has to produce a tree the editor can actually show, not one opaque blob.
     */
    test("turns an object into real fields", () => {
        expect(fromJson({ a: 1, b: "x" })).toEqual({
            kind: "object",
            fields: [
                { key: "a", value: { kind: "static", value: 1 } },
                { key: "b", value: { kind: "static", value: "x" } },
            ],
        });
    });

    test("nests", () => {
        const tree = fromJson({ a: { b: [1, 2] } });
        const inner = readAt(tree, [
            { kind: "field", index: 0 },
            { kind: "field", index: 0 },
        ]);

        expect(inner?.kind).toBe("array");
    });

    test("keeps an array's real length as its count", () => {
        const tree = fromJson([1, 2, 3]);

        expect(tree.kind === "array" && tree.count).toEqual({ kind: "fixed", n: 3 });
    });

    test("an empty array stays empty", () => {
        const tree = fromJson([]);

        expect(tree.kind === "array" && tree.count).toEqual({ kind: "fixed", n: 0 });
    });

    test("handles null", () => {
        expect(fromJson(null)).toEqual({ kind: "static", value: null });
    });
});

describe("pathKey", () => {
    test("is stable for one path", () => {
        expect(pathKey(TAGS)).toBe(pathKey(TAGS));
    });

    test("differs between paths", () => {
        expect(pathKey(PROFILE)).not.toBe(pathKey(TAGS));
    });

    test("distinguishes the four kinds of descent", () => {
        expect(pathKey([{ kind: "of" }])).not.toBe(pathKey([{ kind: "field", index: 0 }]));
        expect(pathKey([{ kind: "option", index: 0 }])).not.toBe(
            pathKey([{ kind: "part", index: 0 }]),
        );
    });

    test("the root is the empty key", () => {
        expect(pathKey([])).toBe("");
    });
});

describe("isAllStatic", () => {
    test("a literal is static", () => {
        expect(isAllStatic({ kind: "static", value: 1 })).toBe(true);
    });

    test("an object of literals is static", () => {
        expect(isAllStatic(fromJson({ a: 1, b: { c: "x" } }))).toBe(true);
    });

    test("a uuid is not", () => {
        expect(isAllStatic({ kind: "uuid" })).toBe(false);
    });

    test("one dynamic leaf makes the whole tree dynamic", () => {
        expect(
            isAllStatic({
                kind: "object",
                fields: [
                    { key: "a", value: { kind: "static", value: 1 } },
                    { key: "b", value: { kind: "faker", fn: "personFullName" } },
                ],
            }),
        ).toBe(false);
    });

    /** A ranged count has no single JSON spelling either. */
    test("an array with a ranged count is not static", () => {
        expect(
            isAllStatic({
                kind: "array",
                of: { kind: "static", value: 1 },
                count: { kind: "range", min: 1, max: 3 },
            }),
        ).toBe(false);
    });
});

describe("toJson", () => {
    test("round-trips an object through fromJson", () => {
        const source = { a: 1, b: { c: "x" } };

        expect(toJson(fromJson(source))).toEqual(source);
    });

    test("round-trips an array of literals", () => {
        expect(toJson(fromJson([1, 1, 1]))).toEqual([1, 1, 1]);
    });

    test("skips a field with no key", () => {
        expect(
            toJson({
                kind: "object",
                fields: [
                    { key: "", value: { kind: "static", value: 1 } },
                    { key: "a", value: { kind: "static", value: 2 } },
                ],
            }),
        ).toEqual({ a: 2 });
    });

    /** Refuses rather than guessing, so a lossy view cannot be shown as real. */
    test("returns null for anything dynamic", () => {
        expect(toJson({ kind: "uuid" })).toBeNull();
    });

    test("gives each array element its own copy", () => {
        const rendered = toJson(fromJson([{ a: 1 }, { a: 1 }])) as { a: number }[];
        rendered[0].a = 9;

        expect(rendered[1].a).toBe(1);
    });
});
