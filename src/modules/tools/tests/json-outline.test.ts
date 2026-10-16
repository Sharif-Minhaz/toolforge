import { describe, expect, test } from "bun:test";

import {
    collapseAllTargets,
    findJsonFolds,
    longestLineColumns,
    splitLines,
    visibleLines,
} from "@/modules/tools/domain/json-outline";
import { formatDocumentText } from "@/modules/tools/domain/document-format";

const DOCUMENT = [
    "{", //                       0
    '  "id": 42,', //             1
    '  "roles": [', //            2
    '    "admin"', //             3
    "  ],", //                    4
    '  "address": {', //          5
    '    "city": "Dhaka"', //     6
    "  },", //                    7
    '  "orders": [', //           8
    "    {", //                   9
    '      "total": 1', //        10
    "    }", //                   11
    "  ],", //                    12
    '  "tags": []', //            13
    "}", //                       14
].join("\n");

describe("findJsonFolds", () => {
    test("finds one fold per bracket that spans lines", () => {
        const folds = findJsonFolds(DOCUMENT);

        expect([...folds.keys()].sort((a, b) => a - b)).toEqual([0, 2, 5, 8, 9]);
        expect(folds.get(0)).toEqual({
            startLine: 0,
            openEnd: 1,
            endLine: 14,
            closeStart: 0,
            depth: 0,
        });
        expect(folds.get(5)).toEqual({
            startLine: 5,
            openEnd: 14,
            endLine: 7,
            closeStart: 2,
            depth: 1,
        });
        expect(folds.get(9)?.depth).toBe(2);
    });

    test("leaves a container that closes on its own line alone", () => {
        expect(findJsonFolds('{"a": [1, 2], "b": {}}').size).toBe(0);
        expect(findJsonFolds(DOCUMENT).has(13)).toBe(false);
    });

    test("keeps the outer bracket when two open on one line", () => {
        const fold = findJsonFolds('[{\n  "a": 1\n}, {\n  "b": 2\n}]').get(0);

        expect(fold).toEqual({ startLine: 0, openEnd: 1, endLine: 4, closeStart: 1, depth: 0 });
    });

    test("ignores brackets inside strings, escaped quotes included", () => {
        const folds = findJsonFolds('{\n  "a": "[{\\"",\n  "b": "}]"\n}');

        expect([...folds.keys()]).toEqual([0]);
        expect(folds.get(0)?.endLine).toBe(3);
    });

    test("ends an unterminated string at the newline", () => {
        const folds = findJsonFolds('{\n  "a": "open\n  "b": [\n    1\n  ]\n}');

        expect(folds.get(2)?.endLine).toBe(4);
    });

    test("survives stray and mismatched brackets", () => {
        expect(() => findJsonFolds("]}\n{[\n}")).not.toThrow();
        expect(findJsonFolds("{\n]\n}").get(0)?.endLine).toBe(2);
        expect(findJsonFolds("")).toEqual(new Map());
    });

    test("reads real serializer output", () => {
        const source = formatDocumentText(
            '{"users":[{"id":1,"tags":["a","b"],"meta":{"x":{"y":[]}}},{"id":2}],"s":"[{"}',
        );

        if (source === null) {
            throw new Error("the fixture should format");
        }

        const folds = findJsonFolds(source);

        expect(folds.size).toBeGreaterThan(4);
        const lines = splitLines(source);

        for (const fold of folds.values()) {
            expect("{[").toContain(lines[fold.startLine][fold.openEnd - 1]);
            expect("}]").toContain(lines[fold.endLine][fold.closeStart]);
        }
    });
});

describe("visibleLines", () => {
    const folds = findJsonFolds(DOCUMENT);
    const count = splitLines(DOCUMENT).length;

    test("shows every line when nothing is collapsed", () => {
        expect(visibleLines(count, folds, new Set())).toHaveLength(15);
    });

    test("skips through the closing line of a collapsed fold", () => {
        expect(visibleLines(count, folds, new Set([5]))).toEqual([
            0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14,
        ]);
    });

    test("an inner collapse inside an outer one changes nothing further", () => {
        expect(visibleLines(count, folds, new Set([8, 9]))).toEqual(
            visibleLines(count, folds, new Set([8])),
        );
    });

    test("collapsing the root leaves one row", () => {
        expect(visibleLines(count, folds, new Set([0]))).toEqual([0]);
    });

    test("a collapsed line with no fold is just a line", () => {
        expect(visibleLines(count, folds, new Set([1]))).toHaveLength(15);
    });
});

describe("collapseAllTargets", () => {
    test("folds everything below the root", () => {
        expect([...collapseAllTargets(findJsonFolds(DOCUMENT))].sort((a, b) => a - b)).toEqual([
            2, 5, 8, 9,
        ]);
    });

    test("folds the root when it is the only fold", () => {
        expect([...collapseAllTargets(findJsonFolds('{\n  "a": 1\n}'))]).toEqual([0]);
    });
});

describe("longestLineColumns", () => {
    test("measures the widest line", () => {
        expect(longestLineColumns(["{", '  "abc": 1', "}"])).toBe(10);
    });

    test("counts a leading tab as a full tab stop", () => {
        expect(longestLineColumns(["\t\t1"])).toBe(17);
    });

    test("is zero for nothing", () => {
        expect(longestLineColumns([])).toBe(0);
    });
});
