import { describe, expect, test } from "bun:test";

import {
    EXAMPLE_SLOTS,
    EXAMPLE_SPECS,
    findExampleSpec,
} from "@/modules/mock-server/domain/example-specs";
import { readOpenApi } from "@/modules/mock-server/domain/openapi";
import { HTTP_METHODS } from "@/modules/mock-server/types/graph";

/**
 * The bundled documents, and the numbers the tiles claim about them.
 *
 * Those numbers are written down rather than counted at render, so the thing
 * that keeps them true is this file. A document edited without its counts
 * fails here instead of shipping a tile that says ten operations over a server
 * with nine.
 *
 * `$ref` resolution is `repository/openapi.ts`'s job and that module is
 * `server-only`, so the walk below is a local stand-in — enough of a resolver
 * for internal pointers, which is all these documents use.
 */

function dereference(root: unknown): unknown {
    function resolve(node: unknown, depth: number): unknown {
        if (depth > 12) {
            return null;
        }

        if (Array.isArray(node)) {
            return node.map((item) => resolve(item, depth + 1));
        }

        if (typeof node !== "object" || node === null) {
            return node;
        }

        const record = node as Record<string, unknown>;

        if (typeof record.$ref === "string" && record.$ref.startsWith("#/")) {
            let current: unknown = root;

            for (const part of record.$ref.slice(2).split("/")) {
                current =
                    typeof current === "object" && current !== null
                        ? (current as Record<string, unknown>)[part]
                        : undefined;
            }

            return current === undefined ? null : resolve(current, depth + 1);
        }

        return Object.fromEntries(
            Object.entries(record).map(([key, value]) => [key, resolve(value, depth + 1)]),
        );
    }

    return resolve(root, 0);
}

/** Method keys under `paths`, counted without going through the mapper. */
function countOperations(document: unknown): number {
    const paths = (document as { paths?: Record<string, unknown> }).paths ?? {};
    const methods = HTTP_METHODS.map((method) => method.toLowerCase());

    return Object.values(paths).reduce<number>(
        (total, item) =>
            total +
            (typeof item === "object" && item !== null
                ? Object.keys(item).filter((key) => methods.includes(key)).length
                : 0),
        0,
    );
}

describe("the bundled example documents", () => {
    test("the picker has room for every one of them", () => {
        expect(EXAMPLE_SPECS.length).toBeLessThanOrEqual(EXAMPLE_SLOTS);
    });

    test("every id is unique", () => {
        expect(new Set(EXAMPLE_SPECS.map((spec) => spec.id)).size).toBe(EXAMPLE_SPECS.length);
    });

    test("an unknown id is a miss rather than a throw", () => {
        expect(findExampleSpec("nothing-like-this")).toBeNull();
    });

    for (const spec of EXAMPLE_SPECS) {
        describe(spec.id, () => {
            const document = dereference(JSON.parse(spec.document) as unknown);
            const read = readOpenApi(document);

            test("is valid JSON the importer can read", () => {
                expect(read.endpoints.length).toBeGreaterThan(0);
            });

            /** An example that cannot be imported whole is worse than none. */
            test("imports with nothing skipped", () => {
                expect(read.skipped).toEqual([]);
            });

            test("the tile's operation count matches the document", () => {
                expect(spec.operations).toBe(countOperations(document));
                expect(spec.operations).toBe(read.endpoints.length);
            });

            test("the tile's required-field count matches the document", () => {
                const required = read.endpoints.reduce(
                    (total, endpoint) => total + endpoint.required.length,
                    0,
                );

                expect(spec.requiredFields).toBe(required);
            });

            test("is served from this repository, never from somebody else's host", () => {
                expect(spec.logo.src.startsWith("/")).toBe(true);
            });
        });
    }
});
