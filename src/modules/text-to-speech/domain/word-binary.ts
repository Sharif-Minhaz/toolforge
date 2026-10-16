import type { CompoundFile } from "./compound-file";

/**
 * The text of a Word 97–2003 `.doc`, read from its piece table.
 *
 * [MS-DOC] in the smallest form that answers "what does it say". A `.doc`
 * keeps its characters in the `WordDocument` stream, but not in order and not
 * in one encoding: a table in the `0Table` or `1Table` stream lists *pieces*,
 * each a run of character positions mapped to a byte offset and marked either
 * as 8-bit Windows-1252 or as UTF-16. A document edited with fast-save has its
 * pieces out of file order, which is why reading the stream front to back
 * returns paragraphs in the wrong order — and why this reads the table.
 *
 * Only the main body. Footnotes, headers and comments follow it in character
 * position and are left out: read aloud in the middle of the text they are
 * noise, and LibreOffice's own text export leaves them out too.
 */

export type WordTextResult =
    | { readonly ok: true; readonly text: string }
    | { readonly ok: false; readonly reason: "encrypted" | "unreadable" | "unsupported_format" };

const WORD_IDENT = 0xa5ec;

/** Word 97 is `nFib` 193; anything below is Word 6 or 95, which has no piece table of this shape. */
const MIN_WORD97_NFIB = 0x00c1;

const FLAG_ENCRYPTED = 0x0100;
const FLAG_TABLE_ONE = 0x0200;
const FLAG_OBFUSCATED = 0x8000;

/** `fcClx` is the 34th offset/length pair in `FibRgFcLcb97`. */
const CLX_PAIR_INDEX = 33;

const PIECE_COMPRESSED = 0x40000000;
const PIECE_OFFSET_MASK = 0x3fffffff;

const CP1252 = new TextDecoder("windows-1252");
const UTF16 = new TextDecoder("utf-16le");

type Piece = {
    readonly start: number;
    readonly end: number;
    readonly offset: number;
    readonly compressed: boolean;
};

function readPieces(table: Uint8Array, clxOffset: number, clxLength: number): Piece[] | null {
    if (clxOffset + clxLength > table.length) {
        return null;
    }

    const view = new DataView(table.buffer, table.byteOffset + clxOffset, clxLength);
    let position = 0;

    // Any number of property runs (`Prc`, type 1) come first and are skipped;
    // the piece table (`Pcdt`, type 2) follows them.
    while (position < clxLength) {
        const type = view.getUint8(position);

        if (type === 0x01) {
            if (position + 3 > clxLength) {
                return null;
            }

            position += 3 + view.getInt16(position + 1, true);
            continue;
        }

        if (type !== 0x02 || position + 5 > clxLength) {
            return null;
        }

        const length = view.getUint32(position + 1, true);
        const start = position + 5;

        if (start + length > clxLength || (length - 4) % 12 !== 0) {
            return null;
        }

        const count = (length - 4) / 12;
        const pieces: Piece[] = [];

        for (let index = 0; index < count; index += 1) {
            const descriptor = start + (count + 1) * 4 + index * 8;
            const raw = view.getUint32(descriptor + 2, true);
            const compressed = (raw & PIECE_COMPRESSED) !== 0;
            const offset = raw & PIECE_OFFSET_MASK;

            pieces.push({
                start: view.getUint32(start + index * 4, true),
                end: view.getUint32(start + (index + 1) * 4, true),
                // A compressed piece's offset is stored doubled.
                offset: compressed ? offset / 2 : offset,
                compressed,
            });
        }

        return pieces;
    }

    return null;
}

/**
 * Word's in-band control characters, turned into what a listener should get.
 *
 * Fields are the one with structure: `0x13` code `0x14` result `0x15`. The
 * code is an instruction — `HYPERLINK "https://…"`, `PAGE` — and the result is
 * what the page shows, so the code is dropped and the result kept, at every
 * level of nesting.
 */
function cleanWordText(raw: string): string {
    const fields: ("code" | "result")[] = [];
    let text = "";

    for (const character of raw) {
        switch (character) {
            case "\u0013":
                fields.push("code");
                continue;
            case "\u0014":
                if (fields.length > 0) {
                    fields[fields.length - 1] = "result";
                }
                continue;
            case "\u0015":
                fields.pop();
                continue;
        }

        if (fields.includes("code")) {
            continue;
        }

        switch (character) {
            case "\r":
            case "\u0007": // end of a table cell or row
            case "\u000b": // manual line break
            case "\u000c": // page or section break
            case "\u000e": // column break
                text += "\n";
                break;
            case "\u001e": // non-breaking hyphen
                text += "-";
                break;
            case "\u0000":
            case "\u0001": // picture
            case "\u0002": // footnote reference
            case "\u0005": // comment reference
            case "\u0008": // drawn object
            case "\u001f": // optional hyphen
                break;
            default:
                text += character;
        }
    }

    return text;
}

export function readWordText(file: CompoundFile): WordTextResult {
    const document = file.readStream("WordDocument");

    if (document === null || document.length < 0x200) {
        return { ok: false, reason: "unreadable" };
    }

    const fib = new DataView(document.buffer, document.byteOffset, document.byteLength);

    if (fib.getUint16(0, true) !== WORD_IDENT) {
        return { ok: false, reason: "unreadable" };
    }

    if (fib.getUint16(2, true) < MIN_WORD97_NFIB) {
        return { ok: false, reason: "unsupported_format" };
    }

    const flags = fib.getUint16(0x0a, true);

    if ((flags & FLAG_ENCRYPTED) !== 0 || (flags & FLAG_OBFUSCATED) !== 0) {
        return { ok: false, reason: "encrypted" };
    }

    // The FIB's middle sections are counted, not fixed, so each offset is
    // found by walking the counts rather than assumed from Word 97's layout.
    const wordCount = fib.getUint16(0x20, true);
    const longsStart = 0x22 + wordCount * 2 + 2;
    const longCount = fib.getUint16(longsStart - 2, true);
    const pairsStart = longsStart + longCount * 4 + 2;
    const pairCount = fib.getUint16(pairsStart - 2, true);

    if (
        longCount < 4 ||
        pairCount <= CLX_PAIR_INDEX ||
        pairsStart + pairCount * 8 > document.length
    ) {
        return { ok: false, reason: "unreadable" };
    }

    const mainLength = fib.getInt32(longsStart + 0x0c, true);
    const clxOffset = fib.getUint32(pairsStart + CLX_PAIR_INDEX * 8, true);
    const clxLength = fib.getUint32(pairsStart + CLX_PAIR_INDEX * 8 + 4, true);

    const table = file.readStream((flags & FLAG_TABLE_ONE) !== 0 ? "1Table" : "0Table");
    const pieces = table === null ? null : readPieces(table, clxOffset, clxLength);

    if (pieces === null || mainLength < 0) {
        return { ok: false, reason: "unreadable" };
    }

    let raw = "";

    for (const piece of pieces) {
        if (piece.start >= mainLength) {
            break;
        }

        const characters = Math.min(piece.end, mainLength) - piece.start;
        const width = piece.compressed ? 1 : 2;
        const end = piece.offset + characters * width;

        if (characters < 0 || end > document.length) {
            return { ok: false, reason: "unreadable" };
        }

        const slice = document.subarray(piece.offset, end);

        raw += piece.compressed ? CP1252.decode(slice) : UTF16.decode(slice);
    }

    return { ok: true, text: cleanWordText(raw) };
}
