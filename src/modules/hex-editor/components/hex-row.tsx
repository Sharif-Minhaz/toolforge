"use client";

import { memo } from "react";

import { cn } from "@/lib/utils";
import { BYTES_PER_ROW } from "../domain/constants";
import { HEX_GRID_STYLE } from "./hex-grid-layout";
import { byteToAscii, byteToHex, formatOffset, nibbleToHex } from "../domain/format";
import type { HexDocument } from "../domain/hex-document";
import type { HexColumn } from "../types";

/**
 * One row of sixteen bytes: the offset, the hex, and the ASCII beside it.
 *
 * Every prop is a primitive or a stable reference, which is what makes the memo
 * around it worth having — a row that is neither selected nor edited nor
 * searched does not re-render when the caret moves three rows away. That is also
 * why the selection arrives as two row-relative indices and the search hits as a
 * sixteen-bit mask rather than as arrays: an array is a new reference every
 * frame and would defeat the comparison it was computed for.
 *
 * The document is read rather than sliced, for the same reason. `revision` is
 * the value that changes when a byte does, and it is what tells the memo that
 * the bytes under this row are no longer the ones it painted.
 *
 * The cells are elements rather than components. The spec this was built from
 * asks for a `HexCell` and an `AsciiCell`; at thirty-two cells a row and forty
 * rows on screen that is 1,280 component instances to reconcile per frame,
 * against 1,280 host elements either way. The cells have no state and no
 * behaviour of their own — the pointer handler lives on the grid and reads
 * `data-offset` — so the component boundary would buy nothing and cost a frame.
 */

export type HexRowProps = {
    document: HexDocument;
    /** Bumped by every byte written. The memo's window onto a mutable document. */
    revision: number;
    startOffset: number;
    /** How many of the sixteen are real bytes; the tail of a short row is blank. */
    byteCount: number;
    /** Row-relative selection bounds, `[selStart, selEnd)`. `-1` for none. */
    selStart: number;
    selEnd: number;
    /** Row-relative caret index, or `-1` when the caret is on another row. */
    caret: number;
    /** The high nibble of a half-typed byte at the caret, or `null`. */
    pendingHigh: number | null;
    /** Bit `n` set when byte `n` of this row is inside a search match. */
    matchMask: number;
    activeColumn: HexColumn;
};

function HexRowInner({
    document,
    startOffset,
    byteCount,
    selStart,
    selEnd,
    caret,
    pendingHigh,
    matchMask,
    activeColumn,
}: HexRowProps) {
    const cells = [];
    const ascii = [];

    for (let index = 0; index < BYTES_PER_ROW; index += 1) {
        const offset = startOffset + index;
        const present = index < byteCount;
        const value = present ? document.getByte(offset) : 0;
        const selected = index >= selStart && index < selEnd;
        const isCaret = index === caret;
        const edited = present && document.isEdited(offset);
        const matched = (matchMask & (1 << index)) !== 0;

        const shared = cn(
            "flex h-full items-center justify-center transition-colors duration-100",
            matched && "bg-syntax-number/25",
            selected && "bg-primary/20",
            !present && "text-transparent",
        );

        const tone = !present
            ? ""
            : edited
              ? "text-syntax-call font-semibold"
              : value === 0
                ? "text-muted-foreground/55"
                : "text-foreground/90";

        cells.push(
            <span
                key={`h${index}`}
                data-offset={present ? offset : undefined}
                data-column="hex"
                className={cn(
                    shared,
                    tone,
                    // The eighth-byte gutter is the convention `hexdump -C` set:
                    // it is what lets a reader find byte 11 without counting.
                    index === 8 && "ml-2",
                    isCaret &&
                        activeColumn === "hex" &&
                        "ring-primary bg-primary/30 rounded-[3px] ring-1 ring-inset",
                    isCaret && activeColumn !== "hex" && "ring-primary/40 rounded-[3px] ring-1",
                )}
            >
                {!present
                    ? "··"
                    : isCaret && pendingHigh !== null
                      ? `${nibbleToHex(pendingHigh)}_`
                      : byteToHex(value)}
            </span>,
        );

        ascii.push(
            <span
                key={`a${index}`}
                data-offset={present ? offset : undefined}
                data-column="ascii"
                className={cn(
                    shared,
                    tone,
                    isCaret &&
                        activeColumn === "ascii" &&
                        "ring-primary bg-primary/30 rounded-[3px] ring-1 ring-inset",
                    isCaret && activeColumn !== "ascii" && "ring-primary/40 rounded-[3px] ring-1",
                )}
            >
                {present ? byteToAscii(value) : " "}
            </span>,
        );
    }

    return (
        <div className="grid text-[0.8125rem] leading-none" style={HEX_GRID_STYLE} role="row">
            <span
                className="text-muted-foreground/70 flex h-full items-center pl-3 tracking-[0.04em] tabular-nums"
                role="rowheader"
            >
                {formatOffset(startOffset)}
            </span>
            {cells}
            <span aria-hidden="true" />
            {ascii}
        </div>
    );
}

export const HexRow = memo(HexRowInner);
