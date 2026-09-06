"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { cn } from "@/lib/utils";
import { BYTES_PER_ROW, ROW_HEIGHT } from "../domain/constants";
import { byteToHex, nibbleToHex, rowCount, rowForOffset } from "../domain/format";
import { rowMatchMask } from "../domain/search";
import { selectionRange } from "../domain/selection";
import { computeRowWindow, scrollTopForRow } from "../domain/window";
import type { HexColumn } from "../types";
import { HEX_GRID_ID, HEX_GRID_MIN_WIDTH, HEX_GRID_STYLE } from "./hex-grid-layout";
import { useHexStore } from "./hex-store";
import { HexRow } from "./hex-row";
import { useHexKeyboard } from "./use-hex-keyboard";

/**
 * The scrolling half of the editor.
 *
 * It owns three things and delegates the rest: where the scrollbar is, how tall
 * the pane is, and whether a pointer is being dragged across it. Which rows that
 * adds up to is `computeRowWindow`'s answer, which is why the awkward case — a
 * document taller than a browser will let an element be — is a tested function
 * rather than something to discover on a large file.
 *
 * Pointer handling sits here rather than on the cells. Thirty-two handlers a row
 * across forty rows is 1,280 closures to allocate per frame; one handler that
 * reads `data-offset` off the event target is the same behaviour for none of the
 * cost, and it is what makes a drag across both columns a single gesture.
 */

const HEADER_HEIGHT = ROW_HEIGHT + 4;

/**
 * Put the caret back in the bytes. Closing the find bar leaves focus on a
 * control that is about to be unmounted, and focus on nothing is a keyboard
 * whose arrow keys scroll the page instead of moving the caret.
 */
export function focusHexGrid(): void {
    document.getElementById(HEX_GRID_ID)?.focus({ preventScroll: true });
}

type Target = { readonly offset: number; readonly column: HexColumn };

function targetFromEvent(event: { target: EventTarget | null }): Target | null {
    const element = event.target instanceof Element ? event.target.closest("[data-offset]") : null;

    if (!(element instanceof HTMLElement) || element.dataset.offset === undefined) {
        return null;
    }

    const offset = Number.parseInt(element.dataset.offset, 10);

    if (!Number.isFinite(offset)) {
        return null;
    }

    return { offset, column: element.dataset.column === "ascii" ? "ascii" : "hex" };
}

export function HexGrid() {
    const t = useTranslations("hexEditor.workbench");

    const document = useHexStore((state) => state.document);
    const revision = useHexStore((state) => state.revision);
    const selection = useHexStore((state) => state.selection);
    const column = useHexStore((state) => state.column);
    const pendingNibble = useHexStore((state) => state.pendingNibble);
    const matches = useHexStore((state) => state.matches);
    const matchLength = useHexStore((state) => state.matchLength);
    const scrollTarget = useHexStore((state) => state.scrollTarget);
    const setCaret = useHexStore((state) => state.setCaret);
    const setColumn = useHexStore((state) => state.setColumn);
    const setRowsPerPage = useHexStore((state) => state.setRowsPerPage);

    const scrollRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(480);
    const handleKeyDown = useHexKeyboard();

    // The pane's height is a fact about the browser, so it is measured rather
    // than assumed — and until it has been, the fallback above renders a
    // sensible number of rows instead of none.
    useEffect(() => {
        const element = scrollRef.current;

        if (element === null) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            const height = entry.contentRect.height;

            setViewportHeight(height);
            setRowsPerPage(Math.max(1, Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT)));
        });

        observer.observe(element);

        return () => observer.disconnect();
    }, [setRowsPerPage]);

    const totalRows = rowCount(document?.length ?? 0);
    const rowsViewport = Math.max(0, viewportHeight - HEADER_HEIGHT);

    // Go To, a search hit and every caret move ask for a scroll through a nonce
    // rather than a flag, so asking twice for the same offset still moves — and
    // so nothing has to be written back to the store from inside this effect.
    const nonce = scrollTarget?.nonce ?? -1;

    useEffect(() => {
        const element = scrollRef.current;
        const target = useHexStore.getState().scrollTarget;

        if (element === null || target === null) {
            return;
        }

        const row = rowForOffset(target.offset);
        const first = Math.ceil(element.scrollTop / ROW_HEIGHT);
        const last = Math.floor((element.scrollTop + rowsViewport) / ROW_HEIGHT) - 1;

        // Already on screen: scrolling anyway would yank the page for every
        // arrow key that stayed inside the viewport.
        if (row >= first && row <= last) {
            return;
        }

        element.scrollTop = scrollTopForRow({
            row,
            totalRows: rowCount(useHexStore.getState().document?.length ?? 0),
            viewportHeight: rowsViewport,
        });
    }, [nonce, rowsViewport]);

    if (document === null) {
        return null;
    }

    const { startRow, endRow, spacerHeight, offsetTop } = computeRowWindow({
        totalRows,
        viewportHeight: rowsViewport,
        scrollTop,
    });

    const range = selectionRange(selection);
    const rows = [];

    for (let row = startRow; row < endRow; row += 1) {
        const startOffset = row * BYTES_PER_ROW;
        const caret = selection.focus - startOffset;
        const inRow = caret >= 0 && caret < BYTES_PER_ROW;

        rows.push(
            <HexRow
                key={row}
                document={document}
                revision={revision}
                startOffset={startOffset}
                byteCount={Math.max(0, Math.min(BYTES_PER_ROW, document.length - startOffset))}
                selStart={Math.max(0, range.start - startOffset)}
                selEnd={Math.min(BYTES_PER_ROW, range.end - startOffset)}
                caret={inRow ? caret : -1}
                pendingHigh={
                    inRow && pendingNibble?.offset === selection.focus ? pendingNibble.high : null
                }
                matchMask={rowMatchMask(matches, matchLength, startOffset)}
                activeColumn={column}
            />,
        );
    }

    function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
        const target = targetFromEvent(event);

        if (target === null) {
            return;
        }

        draggingRef.current = true;
        setColumn(target.column);
        setCaret(target.offset, event.shiftKey);
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
        if (!draggingRef.current || event.buttons !== 1) {
            draggingRef.current = false;

            return;
        }

        const target = targetFromEvent(event);

        if (target !== null) {
            setCaret(target.offset, true);
        }
    }

    return (
        <div
            id={HEX_GRID_ID}
            ref={scrollRef}
            tabIndex={0}
            role="grid"
            aria-label={t("gridLabel")}
            aria-rowcount={totalRows}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => {
                draggingRef.current = false;
            }}
            className={cn(
                "bg-card/40 relative h-full overflow-auto font-mono select-none",
                "focus-visible:ring-primary/60 focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-inset",
            )}
        >
            <div style={{ minWidth: HEX_GRID_MIN_WIDTH }}>
                <div
                    role="row"
                    className={cn(
                        "bg-card/95 border-border/70 text-muted-foreground/80 sticky top-0 z-10 grid",
                        "border-b text-[0.6875rem] tracking-[0.06em] backdrop-blur",
                    )}
                    style={{ ...HEX_GRID_STYLE, height: HEADER_HEIGHT }}
                >
                    <span className="flex h-full items-center pl-3 uppercase" role="columnheader">
                        {t("offsetHeader")}
                    </span>
                    {Array.from({ length: BYTES_PER_ROW }, (_, index) => (
                        <span
                            key={`hh${index}`}
                            role="columnheader"
                            className={cn(
                                "flex h-full items-center justify-center tabular-nums",
                                index === 8 && "ml-2",
                            )}
                        >
                            {byteToHex(index)}
                        </span>
                    ))}
                    <span aria-hidden="true" />
                    {Array.from({ length: BYTES_PER_ROW }, (_, index) => (
                        <span
                            key={`ah${index}`}
                            role="columnheader"
                            className="flex h-full items-center justify-center tabular-nums"
                        >
                            {nibbleToHex(index)}
                        </span>
                    ))}
                </div>

                <div style={{ height: spacerHeight }} className="relative">
                    <div className="absolute inset-x-0" style={{ top: offsetTop }}>
                        {rows}
                    </div>
                </div>
            </div>
        </div>
    );
}
