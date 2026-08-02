import type { DownloadFile } from "@/modules/tools/types";
import type { DiffExportRequest, DiffRow, UnifiedLine } from "../types";
import { COLLAPSE_CONTEXT_LINES, PATCH_LEFT_LABEL, PATCH_RIGHT_LABEL } from "./constants";
import { contextMask, isChangedUnifiedLine, toUnifiedLines } from "./rows";

const MIME_TYPE = "text/x-patch;charset=utf-8";

/** What every patch format calls a file whose last line has no line ending. */
const NO_NEWLINE_MARKER = "\\ No newline at end of file";

const LINE_PREFIX: Record<UnifiedLine["kind"], string> = {
    equal: " ",
    remove: "-",
    add: "+",
};

/**
 * A printed line, plus whether the no-newline marker follows it. The flag lives
 * out here rather than on `UnifiedLine` because it is a fact about the patch
 * format, not about the comparison the screen is showing.
 */
type PatchLine = {
    readonly line: UnifiedLine;
    readonly unterminated: boolean;
};

function belongsToLeft(line: UnifiedLine): boolean {
    return line.kind !== "add";
}

function belongsToRight(line: UnifiedLine): boolean {
    return line.kind !== "remove";
}

function lastIndexOfSide(lines: readonly UnifiedLine[], side: (line: UnifiedLine) => boolean) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (side(lines[index])) {
            return index;
        }
    }

    return -1;
}

/**
 * Bridges the two ways a trailing newline can be described.
 *
 * The row model says a text ending in a newline has a final empty line, because
 * that is what a reader expects to see on screen. A unified diff says the same
 * text has one fewer line and a terminator on the last one — and `patch(1)`
 * rejects a hunk whose line count follows the other convention outright.
 *
 * So the trailing empty line is dropped, and a side left without a terminator
 * is marked the way `diff` marks it. A final context line the two sides
 * disagree about has to be split into a removal and an addition: context means
 * *identical*, and a line that gains or loses its ending is not that.
 */
function toPatchLines(lines: readonly UnifiedLine[]): PatchLine[] {
    const leftEnd = lastIndexOfSide(lines, belongsToLeft);
    const rightEnd = lastIndexOfSide(lines, belongsToRight);

    // A side with no lines at all is an empty file, which needs no marker.
    const leftTerminated = leftEnd < 0 || lines[leftEnd].text === "";
    const rightTerminated = rightEnd < 0 || lines[rightEnd].text === "";

    const working: UnifiedLine[] = [];

    // The two sides' trailing blanks are one row only when they matched each
    // other. When they did not — one file ends with a blank line the other does
    // not have — dropping the row outright would take a real line with it, so a
    // shared row loses just the side whose artifact it was.
    lines.forEach((line, index) => {
        const dropsLeft = leftTerminated && index === leftEnd;
        const dropsRight = rightTerminated && index === rightEnd;

        if (dropsLeft && dropsRight) {
            return;
        }

        if (dropsLeft) {
            if (line.kind === "equal") {
                working.push({ ...line, kind: "add", leftNumber: null });
            }

            return;
        }

        if (dropsRight) {
            if (line.kind === "equal") {
                working.push({ ...line, kind: "remove", rightNumber: null });
            }

            return;
        }

        working.push(line);
    });

    let markLeft = lastIndexOfSide(working, belongsToLeft);
    let markRight = lastIndexOfSide(working, belongsToRight);

    const shared = markLeft >= 0 && markLeft === markRight;

    // A context line is one both files hold identically, its ending included.
    // A final line that has lost its ending on one side only — or that is final
    // for one file and not the other — is therefore not context, and has to be
    // printed as a removal and an addition instead. Two files ending
    // unterminated on the *same* line is the one case where it stays context.
    //
    // At most one line can ever need this: if both sides' last lines were equal
    // rows they would be the same row, since an equal row carries both sides.
    if (!(shared && !leftTerminated && !rightTerminated)) {
        const splitAt =
            !leftTerminated && markLeft >= 0 && working[markLeft].kind === "equal"
                ? markLeft
                : !rightTerminated && markRight >= 0 && working[markRight].kind === "equal"
                  ? markRight
                  : -1;

        if (splitAt >= 0) {
            const line = working[splitAt];

            working.splice(
                splitAt,
                1,
                { ...line, kind: "remove", rightNumber: null },
                { ...line, kind: "add", leftNumber: null },
            );

            markLeft = markLeft === splitAt ? splitAt : markLeft + 1;
            markRight = markRight === splitAt ? splitAt + 1 : markRight + 1;
        }
    }

    return working.map((line, index) => ({
        line,
        unterminated:
            (!leftTerminated && index === markLeft) || (!rightTerminated && index === markRight),
    }));
}

type Hunk = {
    /** Lines of each side printed before this hunk, so a run of pure
     *  insertions can still name the position it belongs at. */
    readonly leftBefore: number;
    readonly rightBefore: number;
    readonly lines: readonly PatchLine[];
};

function buildHunks(lines: readonly PatchLine[], context: number): Hunk[] {
    const keep = contextMask(lines, (entry) => isChangedUnifiedLine(entry.line), context);
    const hunks: Hunk[] = [];

    let current: PatchLine[] = [];
    let leftBefore = 0;
    let rightBefore = 0;
    let leftConsumed = 0;
    let rightConsumed = 0;

    function close() {
        if (current.length > 0) {
            hunks.push({ leftBefore, rightBefore, lines: current });
            current = [];
        }
    }

    lines.forEach((entry, index) => {
        if (keep[index]) {
            if (current.length === 0) {
                leftBefore = leftConsumed;
                rightBefore = rightConsumed;
            }

            current.push(entry);
        } else {
            close();
        }

        if (belongsToLeft(entry.line)) {
            leftConsumed += 1;
        }

        if (belongsToRight(entry.line)) {
            rightConsumed += 1;
        }
    });

    close();

    return hunks;
}

function formatHeader(hunk: Hunk): string {
    const leftCount = hunk.lines.filter((entry) => belongsToLeft(entry.line)).length;
    const rightCount = hunk.lines.filter((entry) => belongsToRight(entry.line)).length;

    // A hunk that touches none of one side names the line it sits after, which
    // is what `diff` emits and what an applier reads as "insert here".
    const leftStart = leftCount === 0 ? hunk.leftBefore : hunk.leftBefore + 1;
    const rightStart = rightCount === 0 ? hunk.rightBefore : hunk.rightBefore + 1;

    return `@@ -${leftStart},${leftCount} +${rightStart},${rightCount} @@`;
}

export type PatchLabels = {
    readonly left: string;
    readonly right: string;
};

/**
 * A unified diff of the comparison — the format `git apply`, `patch(1)` and
 * every review tool already read. Built from the same rows the screen shows, so
 * the file on disk can never disagree with what was on screen.
 *
 * Returns an empty string when nothing differs: `diff` prints nothing for two
 * identical files, and a header with no hunks under it is not a patch.
 */
export function buildUnifiedPatch(
    rows: readonly DiffRow[],
    labels: PatchLabels = { left: PATCH_LEFT_LABEL, right: PATCH_RIGHT_LABEL },
    context: number = COLLAPSE_CONTEXT_LINES,
): string {
    const hunks = buildHunks(toPatchLines(toUnifiedLines(rows)), context);

    if (hunks.length === 0) {
        return "";
    }

    const out: string[] = [`--- ${labels.left}`, `+++ ${labels.right}`];

    for (const hunk of hunks) {
        out.push(formatHeader(hunk));

        for (const entry of hunk.lines) {
            out.push(`${LINE_PREFIX[entry.line.kind]}${entry.line.text}`);

            if (entry.unterminated) {
                out.push(NO_NEWLINE_MARKER);
            }
        }
    }

    return `${out.join("\n")}\n`;
}

/** `diff-20260802T101500Z.patch` — sortable and self-describing. */
export function buildDiffExportFilename(generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `diff-${stamp}.patch`;
}

export function createDiffExportFile(request: DiffExportRequest): DownloadFile {
    return {
        filename: buildDiffExportFilename(request.generatedAt),
        mimeType: MIME_TYPE,
        content: buildUnifiedPatch(request.rows),
    };
}
