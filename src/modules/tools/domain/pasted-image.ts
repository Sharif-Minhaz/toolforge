import { DECODABLE_IMAGE_TYPES, type DecodableImageType } from "../types";
import { normalizeImageType, withImageExtension } from "./image-file";

/**
 * Reading a picture out of the clipboard, minus the browser.
 *
 * There are two clipboards, not one, and they hand back different shapes:
 *
 * - A **paste event** carries `DataTransferItem`s, each with a `kind` and a
 *   `type`. This is the Ctrl+V path and needs no permission, because the
 *   gesture *is* the consent.
 * - **`navigator.clipboard.read()`** carries `ClipboardItem`s, each with a list
 *   of type strings, and prompts for permission the first time. This is the
 *   "Paste" button path, for a reader whose focus is somewhere a paste event
 *   would not reach.
 *
 * Both funnels narrow to the same two questions — is there a picture in here,
 * and what should it be called — so both are answered here, without a DOM.
 */

/** The part of a `DataTransferItem` these rules read. */
export type ClipboardItemFacts = {
    readonly kind: string;
    readonly type: string;
};

/** What a pasted file is called before the reader renames it. */
export const PASTED_IMAGE_STEM = "pasted-image";

/**
 * The first item that is a file this site can decode, or `-1`.
 *
 * `kind` is checked as well as `type` because copying an image *from a web
 * page* puts several representations on the clipboard at once — an
 * `image/png` file, plus `text/html` holding the `<img>` tag it came from.
 * Taking the first entry whose type merely starts with `image/` would work; the
 * allowlist is used instead so an `image/tiff` nothing here decodes is refused
 * at the clipboard rather than three steps later by a decoder returning null.
 */
export function findPastedImage(items: readonly ClipboardItemFacts[]): number {
    return items.findIndex(
        (item) =>
            item.kind === "file" &&
            (DECODABLE_IMAGE_TYPES as readonly string[]).includes(normalizeImageType(item.type)),
    );
}

/**
 * The best decodable type on offer from one `ClipboardItem`, or `null`.
 *
 * Ordered by `DECODABLE_IMAGE_TYPES` rather than by the clipboard's own order,
 * so a reader who copied a picture that is on the clipboard as both PNG and
 * BMP — which is what Windows does — gets the PNG.
 */
export function pickClipboardImageType(types: readonly string[]): DecodableImageType | null {
    const offered = new Set(types.map((type) => normalizeImageType(type)));

    return DECODABLE_IMAGE_TYPES.find((type) => offered.has(type)) ?? null;
}

/**
 * `pasted-image.png`, then `pasted-image-2.png`.
 *
 * The counter is a parameter rather than module state: a filename that depends
 * on how many times this function has been called is not a pure function, and
 * the caller already holds a per-queue counter for its row ids.
 */
export function pastedImageFilename(type: string, sequence = 1): string {
    const stem = sequence > 1 ? `${PASTED_IMAGE_STEM}-${sequence}` : PASTED_IMAGE_STEM;

    return withImageExtension(stem, type);
}
