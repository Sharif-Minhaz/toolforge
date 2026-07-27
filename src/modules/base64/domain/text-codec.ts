import type { Base64DecodeTextResult, Base64EncodeBytesResult, Base64Failure } from "../types";
import { getCharset, type CharsetId } from "./charsets";

/**
 * Text ↔ bytes across every supported character set.
 *
 * `TextDecoder` covers reading. Writing has no browser counterpart beyond
 * UTF-8, so single-byte sets are written through a table inverted from their
 * own decoder — built once per set, on first use.
 */

/** Chunked so a megabyte of Latin-1 does not blow the argument stack. */
const FROM_CHAR_CODE_CHUNK = 8192;

const REPLACEMENT_CHARACTER = "�";

const ASCII_MAX = 0x7f;

const LATIN1_MAX = 0xff;

const singleByteTables = new Map<string, Map<string, number>>();

const decoderSupport = new Map<string, boolean>();

function fail(reason: Base64Failure["reason"], position?: number): Base64Failure {
    return position === undefined ? { ok: false, reason } : { ok: false, reason, position };
}

/**
 * Browsers and Node ship the whole Encoding Standard, but leaner runtimes cut
 * it down to a handful of labels. Asking once beats letting a constructor throw
 * mid-conversion.
 */
export function isCharsetSupported(id: CharsetId): boolean {
    const charset = getCharset(id);
    const cached = decoderSupport.get(charset.decoder);

    if (cached !== undefined) {
        return cached;
    }

    let supported: boolean;

    try {
        // Probed by decoding rather than by reading `.encoding`, which some
        // runtimes leave blank for labels they nonetheless handle correctly.
        new TextDecoder(charset.decoder).decode(new Uint8Array([0x41]));
        supported = true;
    } catch {
        supported = false;
    }

    decoderSupport.set(charset.decoder, supported);

    return supported;
}

function singleByteTable(decoderLabel: string): Map<string, number> {
    const cached = singleByteTables.get(decoderLabel);

    if (cached) {
        return cached;
    }

    const decoder = new TextDecoder(decoderLabel);
    const table = new Map<string, number>();
    const buffer = new Uint8Array(1);

    for (let byte = 0; byte <= LATIN1_MAX; byte += 1) {
        buffer[0] = byte;
        const character = decoder.decode(buffer);

        // U+FFFD marks a byte the set leaves undefined; the first byte to
        // produce a character wins, so the table stays a true inverse.
        if (character !== REPLACEMENT_CHARACTER && !table.has(character)) {
            table.set(character, byte);
        }
    }

    singleByteTables.set(decoderLabel, table);

    return table;
}

/* ---------------------------------------------------------------- encode --- */

function encodeByCodePoint(text: string, maxCode: number): Base64EncodeBytesResult {
    const bytes = new Uint8Array(text.length);
    let count = 0;
    let position = 0;

    for (const character of text) {
        position += 1;
        const code = character.codePointAt(0) ?? 0;

        if (code > maxCode) {
            return fail("unencodable_character", position);
        }

        bytes[count] = code;
        count += 1;
    }

    return { ok: true, bytes: bytes.slice(0, count) };
}

function encodeByTable(text: string, table: Map<string, number>): Base64EncodeBytesResult {
    const bytes = new Uint8Array(text.length);
    let count = 0;
    let position = 0;

    for (const character of text) {
        position += 1;
        const byte = table.get(character);

        if (byte === undefined) {
            return fail("unencodable_character", position);
        }

        bytes[count] = byte;
        count += 1;
    }

    return { ok: true, bytes: bytes.slice(0, count) };
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
    const bytes = new Uint8Array(text.length * 2);

    // Written per code unit, so surrogate pairs survive as themselves.
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        const high = (code >>> 8) & 0xff;
        const low = code & 0xff;

        bytes[index * 2] = littleEndian ? low : high;
        bytes[index * 2 + 1] = littleEndian ? high : low;
    }

    return bytes;
}

export function textToBytes(text: string, charsetId: CharsetId): Base64EncodeBytesResult {
    const charset = getCharset(charsetId);

    switch (charset.encoder) {
        case "utf-8":
            return { ok: true, bytes: new TextEncoder().encode(text) };
        case "utf-16le":
            return { ok: true, bytes: encodeUtf16(text, true) };
        case "utf-16be":
            return { ok: true, bytes: encodeUtf16(text, false) };
        case "ascii":
            return encodeByCodePoint(text, ASCII_MAX);
        case "latin1":
            return encodeByCodePoint(text, LATIN1_MAX);
        case "single-byte":
            return isCharsetSupported(charsetId)
                ? encodeByTable(text, singleByteTable(charset.decoder))
                : fail("unsupported_charset");
        case null:
            // The UI never offers a decode-only set here; this keeps the
            // failure typed rather than silently producing wrong bytes.
            return fail("unencodable_character");
    }
}

/* ---------------------------------------------------------------- decode --- */

function decodeLatin1(bytes: Uint8Array): string {
    let text = "";

    for (let index = 0; index < bytes.length; index += FROM_CHAR_CODE_CHUNK) {
        text += String.fromCharCode(...bytes.subarray(index, index + FROM_CHAR_CODE_CHUNK));
    }

    return text;
}

export function bytesToText(bytes: Uint8Array, charsetId: CharsetId): Base64DecodeTextResult {
    const charset = getCharset(charsetId);

    // Latin-1 and ASCII have no faithful TextDecoder label — both fold into
    // windows-1252, which rewrites 0x80–0x9F — so they are read directly.
    if (charset.encoder === "latin1") {
        return { ok: true, text: decodeLatin1(bytes) };
    }

    if (charset.encoder === "ascii") {
        return bytes.some((byte) => byte > ASCII_MAX)
            ? fail("undecodable_text")
            : { ok: true, text: decodeLatin1(bytes) };
    }

    if (!isCharsetSupported(charsetId)) {
        return fail("unsupported_charset");
    }

    try {
        return { ok: true, text: new TextDecoder(charset.decoder, { fatal: true }).decode(bytes) };
    } catch {
        // The base64 unpacked fine; those bytes just are not text in this set.
        return fail("undecodable_text");
    }
}
