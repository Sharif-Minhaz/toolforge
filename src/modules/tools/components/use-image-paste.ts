"use client";

import { useEffect, useRef } from "react";

import { findPastedImage } from "../domain/pasted-image";

/**
 * Ctrl+V anywhere on the page puts a picture into the tool.
 *
 * Bound to the window rather than to the drop zone on purpose: a paste event
 * fires at whatever has focus, and on a page where nothing has been clicked yet
 * that is the body. Asking the reader to click the drop zone before pasting is
 * asking them to already know where the paste is going.
 *
 * **A paste with no picture in it is left alone.** The listener only ever
 * claims the event when the clipboard actually holds a file this site can
 * decode, so pasting a URL into the import field below still works normally —
 * the alternative is a page where Ctrl+V into a text box silently does nothing.
 *
 * No permission is asked for and none is needed: the paste gesture *is* the
 * consent, which is the whole difference between this and the button that calls
 * `readClipboardImage`.
 */
export function useImagePaste(onImage: (file: File) => void, enabled = true): void {
    // The latest callback, so the listener is attached once rather than
    // re-attached on every render of a component whose handler is an inline
    // closure — which is every caller.
    const latest = useRef(onImage);

    useEffect(() => {
        latest.current = onImage;
    });

    useEffect(() => {
        if (!enabled) {
            return;
        }

        function handlePaste(event: ClipboardEvent) {
            const items = event.clipboardData?.items;

            if (items === undefined) {
                return;
            }

            const entries = [...items];
            const index = findPastedImage(entries);

            if (index < 0) {
                return;
            }

            const file = entries[index].getAsFile();

            if (file === null) {
                return;
            }

            event.preventDefault();
            latest.current(file);
        }

        window.addEventListener("paste", handlePaste);

        return () => window.removeEventListener("paste", handlePaste);
    }, [enabled]);
}
