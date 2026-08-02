import { describe, expect, test } from "bun:test";

import { compareTexts } from "@/modules/diff/domain/compare";
import {
    buildDiffExportFilename,
    buildUnifiedPatch,
    createDiffExportFile,
} from "@/modules/diff/domain/export";
import type { DiffOptions, DiffRow } from "@/modules/diff/types";

const PLAIN: DiffOptions = { precision: "line", ignoreCase: false, ignoreWhitespace: false };

function rowsOf(left: string, right: string): readonly DiffRow[] {
    const result = compareTexts(left, right, PLAIN);

    if (!result.ok) {
        throw new Error(`expected a comparison, got ${result.reason}`);
    }

    return result.rows;
}

const NO_NEWLINE_MARKER = "\\ No newline at end of file";

/**
 * A file the way a patch tool sees one: a list of lines, and whether the last
 * of them carries a line ending. Deliberately *not* the row model's "a trailing
 * newline is a final empty line", so the applier below cannot inherit the
 * assumption it is meant to be checking.
 */
function splitFile(text: string): { lines: string[]; terminated: boolean } {
    if (text.length === 0) {
        return { lines: [], terminated: true };
    }

    const terminated = text.endsWith("\n");

    return { lines: (terminated ? text.slice(0, -1) : text).split("\n"), terminated };
}

function joinFile(lines: readonly string[], terminated: boolean): string {
    return lines.length === 0 ? "" : `${lines.join("\n")}${terminated ? "\n" : ""}`;
}

/**
 * An applier written from the unified-diff format alone — it reads the `@@`
 * numbers, the one-character prefixes and the no-newline marker, and knows
 * nothing about the rows the patch came from. A patch can look right and still
 * carry hunk arithmetic no tool can apply; this refuses any hunk whose context
 * does not line up with the original or whose header miscounts its own body.
 */
function applyUnifiedPatch(original: string, patch: string): string {
    const source = splitFile(original);
    const patchLines = patch.split("\n");

    if (patchLines[patchLines.length - 1] === "") {
        patchLines.pop();
    }

    const out: string[] = [];
    let cursor = 0;
    let index = 2;
    let markedEnd = false;

    while (index < patchLines.length) {
        const header = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(patchLines[index]);

        if (!header) {
            throw new Error(`bad hunk header: ${patchLines[index]}`);
        }

        const leftStart = Number(header[1]);
        const leftCount = Number(header[2]);
        const rightCount = Number(header[4]);
        const from = leftCount === 0 ? leftStart : leftStart - 1;

        while (cursor < from) {
            out.push(source.lines[cursor]);
            cursor += 1;
        }

        index += 1;

        let usedLeft = 0;
        let usedRight = 0;
        let previous = "";

        while (index < patchLines.length && !patchLines[index].startsWith("@@")) {
            const line = patchLines[index];
            const body = line.slice(1);

            if (line === NO_NEWLINE_MARKER) {
                if (previous === " " || previous === "+") {
                    markedEnd = true;
                }
            } else if (line.startsWith(" ") || line.startsWith("-")) {
                if (source.lines[cursor] !== body) {
                    throw new Error(`hunk does not line up at source line ${cursor + 1}`);
                }

                if (line.startsWith(" ")) {
                    out.push(body);
                    usedRight += 1;
                    markedEnd = false;
                }

                cursor += 1;
                usedLeft += 1;
                previous = line.slice(0, 1);
            } else if (line.startsWith("+")) {
                out.push(body);
                usedRight += 1;
                markedEnd = false;
                previous = "+";
            } else {
                throw new Error(`bad body line: ${line}`);
            }

            index += 1;
        }

        if (usedLeft !== leftCount || usedRight !== rightCount) {
            throw new Error(
                `hunk header counts ${leftCount}/${rightCount}, body ${usedLeft}/${usedRight}`,
            );
        }
    }

    // Lines after the last hunk were never described by the patch, so the end
    // of the file is whatever the original's end was.
    const tailCopied = cursor < source.lines.length;

    while (cursor < source.lines.length) {
        out.push(source.lines[cursor]);
        cursor += 1;
    }

    return joinFile(out, tailCopied ? source.terminated : !markedEnd);
}

const PAIRS: readonly (readonly [string, string])[] = [
    ["a\nb\nc", "a\nx\nc"],
    ["a\nb\nc", "a\nb\nc\nd"],
    ["a\nb\nc\nd", "b\nc\nd"],
    ["", "first line\nsecond line"],
    ["only line", ""],
    ["a\n", "a\nb\n"],
    [
        Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"),
        Array.from({ length: 30 }, (_, index) =>
            index === 2 || index === 25 ? `changed ${index}` : `line ${index}`,
        ).join("\n"),
    ],
    ["x\ny\nz", "1\n2\n3"],
    // The trailing newline, which the two models describe differently.
    ["a\nb\n", "a\nb"],
    ["a\nb", "a\nb\n"],
    ["a\n\n\nb", "a\n\nb\n"],
    ["a\nb", "a\nc"],
    ["a\nb\n\n", "a\nb\n"],
];

describe("buildUnifiedPatch", () => {
    test("produces a patch that turns the left text into the right one", () => {
        for (const [left, right] of PAIRS) {
            const patch = buildUnifiedPatch(rowsOf(left, right));

            expect(applyUnifiedPatch(left, patch), `${left} → ${right}`).toBe(right);
        }
    });

    test("writes nothing at all when the two sides match", () => {
        expect(buildUnifiedPatch(rowsOf("a\nb", "a\nb"))).toBe("");
    });

    test("names both files in the header", () => {
        const patch = buildUnifiedPatch(rowsOf("a", "b"));

        expect(patch.split("\n").slice(0, 2)).toEqual(["--- original.txt", "+++ changed.txt"]);
    });

    test("takes the labels it is given", () => {
        const patch = buildUnifiedPatch(rowsOf("a", "b"), { left: "before.md", right: "after.md" });

        expect(patch.split("\n").slice(0, 2)).toEqual(["--- before.md", "+++ after.md"]);
    });

    test("counts a hunk and its context from one", () => {
        const left = Array.from({ length: 10 }, (_, index) => `line ${index}`);
        const right = [...left];
        right[4] = "changed";

        const patch = buildUnifiedPatch(rowsOf(left.join("\n"), right.join("\n")));

        expect(patch.split("\n")[2]).toBe("@@ -2,7 +2,7 @@");
    });

    test("names the line an insertion sits after when it removes nothing", () => {
        const patch = buildUnifiedPatch(rowsOf("", "a\nb"));

        expect(patch.split("\n")[2]).toBe("@@ -0,0 +1,2 @@");
    });

    test("splits distant changes into separate hunks", () => {
        const left = Array.from({ length: 30 }, (_, index) => `line ${index}`);
        const right = [...left];
        right[2] = "one";
        right[25] = "two";

        const patch = buildUnifiedPatch(rowsOf(left.join("\n"), right.join("\n")));

        expect(patch.split("\n").filter((line) => line.startsWith("@@"))).toHaveLength(2);
    });

    test("does not print the trailing newline as a line of its own", () => {
        const patch = buildUnifiedPatch(rowsOf("a\nb\n", "a\nc\n"));

        expect(patch.split("\n").slice(2)).toEqual(["@@ -1,2 +1,2 @@", " a", "-b", "+c", ""]);
    });

    test("marks a side left without a line ending, splitting the context it shared", () => {
        const patch = buildUnifiedPatch(rowsOf("a\nb\n", "a\nb"));

        expect(patch.split("\n").slice(2)).toEqual([
            "@@ -1,2 +1,2 @@",
            " a",
            "-b",
            "+b",
            "\\ No newline at end of file",
            "",
        ]);
    });

    test("marks both sides once when neither ends in a line ending", () => {
        const patch = buildUnifiedPatch(rowsOf("a\nb", "a\nb"));

        // Identical, so there is no patch at all — the marker only ever appears
        // beside a line the patch already had reason to print.
        expect(patch).toBe("");
    });

    test("prints removals before additions inside one hunk", () => {
        const patch = buildUnifiedPatch(rowsOf("a\nb\nkeep", "x\ny\nkeep"));

        expect(patch.split("\n").slice(3, 7)).toEqual(["-a", "-b", "+x", "+y"]);
    });
});

describe("createDiffExportFile", () => {
    test("stamps the filename with a sortable UTC instant", () => {
        expect(buildDiffExportFilename(new Date("2026-08-02T10:15:00.000Z"))).toBe(
            "diff-20260802T101500Z.patch",
        );
    });

    test("hands over the same patch the copy button does", () => {
        const rows = rowsOf("a\nb", "a\nc");
        const file = createDiffExportFile({ rows, generatedAt: new Date("2026-08-02T10:15:00Z") });

        expect(file.mimeType).toBe("text/x-patch;charset=utf-8");
        expect(file.content).toBe(buildUnifiedPatch(rows));
    });
});
