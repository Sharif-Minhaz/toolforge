"use client";

import type { KeyboardEvent } from "react";

import { hexDigitValue } from "../domain/format";
import { useHexStore } from "./hex-store";
import type { CaretMove } from "../types";

/**
 * Every key the grid itself answers.
 *
 * The file-level shortcuts — open, save, find, go to — are not here: they have
 * to work while the focus is in a dialog or on the toolbar, so they hang off the
 * window instead. What lives here is everything that only means something while
 * the caret is in the grid.
 *
 * The handler is a plain function rather than an effect-registered listener,
 * which keeps it off the document and keeps a keystroke inside a search box from
 * moving the caret behind it.
 */

const MOVES: Record<string, CaretMove> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    PageUp: "pageUp",
    PageDown: "pageDown",
};

export function useHexKeyboard(): (event: KeyboardEvent<HTMLElement>) => void {
    const moveBy = useHexStore((state) => state.moveBy);
    const setColumn = useHexStore((state) => state.setColumn);
    const setCaret = useHexStore((state) => state.setCaret);
    const selectEverything = useHexStore((state) => state.selectEverything);
    const typeHexDigit = useHexStore((state) => state.typeHexDigit);
    const typeAscii = useHexStore((state) => state.typeAscii);
    const clearSelectedBytes = useHexStore((state) => state.clearSelectedBytes);
    const backspace = useHexStore((state) => state.backspace);
    const undoEdit = useHexStore((state) => state.undoEdit);
    const redoEdit = useHexStore((state) => state.redoEdit);

    return (event: KeyboardEvent<HTMLElement>) => {
        const { key, shiftKey, ctrlKey, metaKey, altKey } = event;
        const command = ctrlKey || metaKey;

        if (altKey) {
            return;
        }

        const move = MOVES[key];

        if (move !== undefined) {
            event.preventDefault();
            moveBy(move, shiftKey);

            return;
        }

        if (key === "Home" || key === "End") {
            event.preventDefault();
            moveBy(
                command
                    ? key === "Home"
                        ? "documentStart"
                        : "documentEnd"
                    : key === "Home"
                      ? "rowStart"
                      : "rowEnd",
                shiftKey,
            );

            return;
        }

        // Tab moves between the two halves of the grid rather than out of it.
        // Shift+Tab is left alone, so there is always a way back to the toolbar.
        if (key === "Tab" && !shiftKey && !command) {
            event.preventDefault();
            setColumn(useHexStore.getState().column === "hex" ? "ascii" : "hex");

            return;
        }

        if (command && (key === "a" || key === "A")) {
            event.preventDefault();
            selectEverything();

            return;
        }

        if (command && (key === "z" || key === "Z")) {
            event.preventDefault();
            // Ctrl+Shift+Z is redo everywhere except Windows, where Ctrl+Y is;
            // both are accepted rather than asking the reader which they have.
            if (shiftKey) {
                redoEdit();
            } else {
                undoEdit();
            }

            return;
        }

        if (command && (key === "y" || key === "Y")) {
            event.preventDefault();
            redoEdit();

            return;
        }

        if (command) {
            return;
        }

        if (key === "Backspace") {
            event.preventDefault();
            backspace();

            return;
        }

        if (key === "Delete") {
            event.preventDefault();
            clearSelectedBytes();

            return;
        }

        // Abandons a half-typed byte without writing anything.
        if (key === "Escape") {
            event.preventDefault();
            setCaret(useHexStore.getState().selection.focus, false);

            return;
        }

        if (key.length !== 1) {
            return;
        }

        if (useHexStore.getState().column === "hex") {
            const digit = hexDigitValue(key);

            if (digit !== null) {
                event.preventDefault();
                typeHexDigit(digit);
            }

            return;
        }

        const code = key.charCodeAt(0);

        // Latin-1 only, because a byte is what is being typed. An emoji has no
        // single-byte reading and is left alone rather than written as its first
        // UTF-8 byte.
        if (code <= 0xff) {
            event.preventDefault();
            typeAscii(code);
        }
    };
}
