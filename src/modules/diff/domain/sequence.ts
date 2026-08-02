import type { SequenceDiffResult, SequenceOp } from "../types";

/** Which way the backtrack walks out of a cell. */
const DIAGONAL = 0;
const SKIP_LEFT = 1;
const SKIP_RIGHT = 2;

function equal(leftIndex: number, rightIndex: number): SequenceOp {
    return { kind: "equal", leftIndex, rightIndex };
}

function removed(leftIndex: number): SequenceOp {
    return { kind: "delete", leftIndex, rightIndex: -1 };
}

function added(rightIndex: number): SequenceOp {
    return { kind: "insert", leftIndex: -1, rightIndex };
}

/**
 * Longest common subsequence over the part that is left once the shared ends
 * are gone. One score row is kept at a time; the direction taken out of every
 * cell goes into a byte per cell, which is what the walk back reads.
 *
 * The walk back reads the table from its end and the script is reversed after,
 * so everything about ordering here is upside down: taking `SKIP_RIGHT` on a
 * tie, and draining the leftover columns before the leftover rows, is what puts
 * every deletion of a rewritten block *ahead* of its insertions in the output.
 * That is the order both the paired rows and the unified patch are built from.
 */
function diffMiddle(
    left: readonly string[],
    right: readonly string[],
    offset: number,
): SequenceOp[] {
    const rows = left.length;
    const columns = right.length;

    if (rows === 0) {
        return right.map((_, index) => added(offset + index));
    }

    if (columns === 0) {
        return left.map((_, index) => removed(offset + index));
    }

    const choice = new Uint8Array(rows * columns);
    let previous = new Int32Array(columns + 1);
    let current = new Int32Array(columns + 1);

    for (let row = 0; row < rows; row += 1) {
        const base = row * columns;

        for (let column = 0; column < columns; column += 1) {
            if (left[row] === right[column]) {
                current[column + 1] = previous[column] + 1;
                choice[base + column] = DIAGONAL;
            } else if (current[column] >= previous[column + 1]) {
                current[column + 1] = current[column];
                choice[base + column] = SKIP_RIGHT;
            } else {
                current[column + 1] = previous[column + 1];
                choice[base + column] = SKIP_LEFT;
            }
        }

        // `current[0]` is never written, so the swapped-in row still starts at
        // zero and every other cell is overwritten before it is read.
        const spent = previous;
        previous = current;
        current = spent;
    }

    const reversed: SequenceOp[] = [];
    let row = rows - 1;
    let column = columns - 1;

    while (row >= 0 && column >= 0) {
        const step = choice[row * columns + column];

        if (step === DIAGONAL) {
            reversed.push(equal(offset + row, offset + column));
            row -= 1;
            column -= 1;
        } else if (step === SKIP_LEFT) {
            reversed.push(removed(offset + row));
            row -= 1;
        } else {
            reversed.push(added(offset + column));
            column -= 1;
        }
    }

    while (column >= 0) {
        reversed.push(added(offset + column));
        column -= 1;
    }

    while (row >= 0) {
        reversed.push(removed(offset + row));
        row -= 1;
    }

    return reversed.reverse();
}

/**
 * The one comparison the whole tool runs, over lines or over the tokens of a
 * single line. Both sides are already reduced to comparison keys, so this never
 * has to know what an ignore option is.
 *
 * Shared leading and trailing runs are matched off first. That is not only a
 * speed-up: it is what keeps two long, mostly identical files inside
 * `maxCells`, since only the disagreeing middle is ever put in the table.
 */
export function diffSequences(
    left: readonly string[],
    right: readonly string[],
    maxCells: number,
): SequenceDiffResult {
    const shortest = Math.min(left.length, right.length);

    let prefix = 0;

    while (prefix < shortest && left[prefix] === right[prefix]) {
        prefix += 1;
    }

    let suffix = 0;

    while (
        suffix < shortest - prefix &&
        left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
    ) {
        suffix += 1;
    }

    const leftMiddle = left.slice(prefix, left.length - suffix);
    const rightMiddle = right.slice(prefix, right.length - suffix);

    if (leftMiddle.length * rightMiddle.length > maxCells) {
        return { ok: false, reason: "too_large" };
    }

    const ops: SequenceOp[] = [];

    for (let index = 0; index < prefix; index += 1) {
        ops.push(equal(index, index));
    }

    for (const op of diffMiddle(leftMiddle, rightMiddle, prefix)) {
        ops.push(op);
    }

    for (let index = 0; index < suffix; index += 1) {
        ops.push(equal(left.length - suffix + index, right.length - suffix + index));
    }

    return { ok: true, ops };
}
