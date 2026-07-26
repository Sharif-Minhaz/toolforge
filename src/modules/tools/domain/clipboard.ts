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
