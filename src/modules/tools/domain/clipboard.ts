import type { DecodableImageType } from "../types";
import { pickClipboardImageType } from "./pasted-image";

export type CopyFailureReason = "empty" | "unsupported" | "denied";

export type CopyResult =
    { readonly ok: true } | { readonly ok: false; readonly reason: CopyFailureReason };

/** Minimal surface of `navigator.clipboard` this module depends on. */
export type ClipboardWriter = {
    writeText(text: string): Promise<void>;
};

function resolveClipboard(): ClipboardWriter | undefined {
    return typeof navigator === "undefined" ? undefined : navigator.clipboard;
}

/**
 * Copies text to the system clipboard, returning a typed result instead of
 * throwing — callers render a toast either way.
 */
export async function copyText(
    text: string,
    clipboard: ClipboardWriter | undefined = resolveClipboard(),
): Promise<CopyResult> {
    if (text.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (!clipboard) {
        return { ok: false, reason: "unsupported" };
    }

    try {
        await clipboard.writeText(text);

        return { ok: true };
    } catch {
        // Permission denied, or the document was not focused.
        return { ok: false, reason: "denied" };
    }
}

/** The part of a `ClipboardItem` the reader below touches. */
export type ClipboardImageItem = {
    readonly types: readonly string[];
    getType(type: string): Promise<Blob>;
};

/** Minimal surface of the async clipboard's read half. */
export type ClipboardReader = {
    read(): Promise<readonly ClipboardImageItem[]>;
};

function resolveClipboardReader(): ClipboardReader | undefined {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
        return undefined;
    }

    // Firefox ships `navigator.clipboard` without `read`, so the capability is
    // probed by looking for the method rather than for the object.
    return typeof navigator.clipboard.read === "function" ? navigator.clipboard : undefined;
}

export type ReadImageResult =
    | { readonly ok: true; readonly blob: Blob; readonly type: DecodableImageType }
    | { readonly ok: false; readonly reason: CopyFailureReason };

/**
 * Takes a picture off the system clipboard on request.
 *
 * The button path, as opposed to Ctrl+V. It exists because a paste event only
 * fires at whatever has focus, and a reader who has just copied a screenshot
 * and then clicked a button on this page has focus on the button — while a
 * reader on a touch device has no Ctrl+V at all.
 *
 * Unlike a paste event, this **asks for permission**: the gesture is a click on
 * our own button rather than the platform's paste, so the browser prompts the
 * first time and remembers the answer. A refusal comes back as `denied`, which
 * the caller renders as "allow clipboard access, or press Ctrl+V instead" — a
 * dead end with a way out beats a dead end.
 *
 * Injectable for the same reason `copyText` is: it keeps this testable without
 * a browser.
 */
export async function readClipboardImage(
    reader: ClipboardReader | undefined = resolveClipboardReader(),
): Promise<ReadImageResult> {
    if (!reader) {
        return { ok: false, reason: "unsupported" };
    }

    let items: readonly ClipboardImageItem[];

    try {
        items = await reader.read();
    } catch {
        // Permission refused, the document was not focused, or the platform
        // refused to hand over a format it holds. All three are the same thing
        // to do about it.
        return { ok: false, reason: "denied" };
    }

    for (const item of items) {
        const type = pickClipboardImageType(item.types);

        if (type === null) {
            continue;
        }

        try {
            return { ok: true, blob: await item.getType(type), type };
        } catch {
            return { ok: false, reason: "denied" };
        }
    }

    return { ok: false, reason: "empty" };
}
