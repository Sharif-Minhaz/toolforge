/**
 * What a file is, from its name and from its first bytes.
 *
 * Lifted out of the PDF Converter's `source-format.ts` when Text to Speech
 * needed the same checks for the documents it reads. Which extensions mean
 * which format is each tool's own business and stays in the tool; these only
 * answer "what does the name end in" and "what do the bytes start with".
 */

export function fileExtensionOf(filename: string): string {
    const dot = filename.lastIndexOf(".");

    return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** `PK\x03\x04` — the local file header every ZIP, and so every OOXML file, starts with. */
export function looksLikeZip(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04
    );
}

/**
 * `D0 CF 11 E0 A1 B1 1A E1` — the OLE2 compound-file header shared by every
 * pre-2007 Office document. Recognised so a `.doc` renamed to `.docx` is still
 * refused by name.
 */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function looksLikeLegacyOffice(bytes: Uint8Array): boolean {
    return (
        bytes.length >= OLE_SIGNATURE.length &&
        OLE_SIGNATURE.every((byte, index) => bytes[index] === byte)
    );
}

/**
 * `%PDF-` within the first kilobyte, which is where readers look for it —
 * some writers put a few bytes of junk ahead of the header, and every viewer
 * tolerates that.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
    const head = String.fromCharCode(...bytes.subarray(0, 1_024));

    return head.includes("%PDF-");
}
