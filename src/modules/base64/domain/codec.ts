import type {
    Base64DecodeBytesResult,
    Base64DecodeTextResult,
    Base64EncodeOptions,
    Base64Failure,
    Base64FailureReason,
    ByteSize,
} from "../types";
import {
    ALPHABETS,
    BYTES_PER_KILOBYTE,
    DATA_URI_PATTERN,
    DEFAULT_DATA_URI_MIME_TYPE,
    DEFAULT_ENCODE_OPTIONS,
    MAX_BASE64_INPUT_BYTES,
    STANDARD_ALPHABET,
    URL_SAFE_ALPHABET,
} from "./constants";
import { bytesToText, textToBytes } from "./text-codec";

/**
 * RFC 4648 base64, implemented over raw bytes so the same code path runs on the
 * server and in the browser and never depends on `btoa`, which is limited to
 * Latin-1. Nothing here touches the network or the DOM.
 */

const SEXTET_BITS = 6;

const PAD = "=";

/** Lookup for every ASCII code point; `-1` marks a character base64 never uses. */
const DECODE_TABLE = buildDecodeTable();

function buildDecodeTable(): Int8Array {
    const table = new Int8Array(128).fill(-1);

    for (let value = 0; value < STANDARD_ALPHABET.length; value += 1) {
        table[STANDARD_ALPHABET.charCodeAt(value)] = value;
        // The two alphabets differ only in their last two symbols, so decoding
        // stays tolerant of either without asking the caller which one it is.
        table[URL_SAFE_ALPHABET.charCodeAt(value)] = value;
    }

    return table;
}

function isWhitespace(charCode: number): boolean {
    return charCode === 32 || (charCode >= 9 && charCode <= 13);
}

function fail(reason: Base64FailureReason, position?: number): Base64Failure {
    return position === undefined ? { ok: false, reason } : { ok: false, reason, position };
}

/* ---------------------------------------------------------------- encode --- */

export function encodeBytes(
    bytes: Uint8Array,
    options: Base64EncodeOptions = DEFAULT_ENCODE_OPTIONS,
): string {
    const alphabet = ALPHABETS[options.alphabet];
    const parts: string[] = [];
    let index = 0;

    for (; index + 2 < bytes.length; index += 3) {
        const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];

        parts.push(
            alphabet[(chunk >>> 18) & 63] +
                alphabet[(chunk >>> 12) & 63] +
                alphabet[(chunk >>> 6) & 63] +
                alphabet[chunk & 63],
        );
    }

    const remaining = bytes.length - index;

    if (remaining === 1) {
        const chunk = bytes[index] << 16;

        parts.push(
            alphabet[(chunk >>> 18) & 63] +
                alphabet[(chunk >>> 12) & 63] +
                (options.padded ? `${PAD}${PAD}` : ""),
        );
    } else if (remaining === 2) {
        const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8);

        parts.push(
            alphabet[(chunk >>> 18) & 63] +
                alphabet[(chunk >>> 12) & 63] +
                alphabet[(chunk >>> 6) & 63] +
                (options.padded ? PAD : ""),
        );
    }

    return parts.join("");
}

/** UTF-8 convenience wrapper; every other set goes through `text-codec`. */
export function encodeText(text: string, options?: Base64EncodeOptions): string {
    const encoded = textToBytes(text, "utf-8");

    // UTF-8 can represent any string, so this branch is unreachable.
    return encoded.ok ? encodeBytes(encoded.bytes, options) : "";
}

/** UTF-8 byte length — a size measure, independent of the chosen character set. */
export function getByteLength(text: string): number {
    return new TextEncoder().encode(text).length;
}

/* ---------------------------------------------------------------- decode --- */

type DataUri = {
    /** The base64 payload, with any `data:` header removed. */
    readonly payload: string;
    readonly mimeType?: string;
    /** Index in the original string where the payload begins. */
    readonly offset: number;
};

/** Splits `data:image/png;base64,iVBOR…` into its media type and payload. */
export function stripDataUriPrefix(input: string): DataUri {
    const leading = input.length - input.trimStart().length;
    const trimmed = input.slice(leading);
    const header = DATA_URI_PATTERN.exec(trimmed);

    if (!header) {
        return { payload: trimmed, offset: leading };
    }

    return {
        payload: trimmed.slice(header[0].length),
        mimeType: header[1] || DEFAULT_DATA_URI_MIME_TYPE,
        offset: leading + header[0].length,
    };
}

export function buildDataUri(base64: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64}`;
}

/**
 * Decodes base64 text to bytes, accepting either alphabet, embedded whitespace,
 * a `data:` header, and missing padding. Returns a typed failure instead of
 * throwing so the caller can render a specific message.
 */
export function decodeToBytes(input: string): Base64DecodeBytesResult {
    const { payload, offset } = stripDataUriPrefix(input);
    const sextets = new Uint8Array(payload.length);
    let count = 0;
    let padding = 0;

    for (let index = 0; index < payload.length; index += 1) {
        const charCode = payload.charCodeAt(index);

        if (isWhitespace(charCode)) {
            continue;
        }

        if (charCode === PAD.charCodeAt(0)) {
            padding += 1;
            continue;
        }

        // Padding closes the message; anything after it is malformed.
        if (padding > 0) {
            return fail("invalid_character", offset + index + 1);
        }

        const value = charCode < 128 ? DECODE_TABLE[charCode] : -1;

        if (value < 0) {
            return fail("invalid_character", offset + index + 1);
        }

        sextets[count] = value;
        count += 1;
    }

    if (padding > 2 || (padding > 0 && (count + padding) % 4 !== 0)) {
        return fail("invalid_length");
    }

    // Four sextets carry three bytes; a lone leftover sextet cannot exist.
    if (count % 4 === 1) {
        return fail("invalid_length");
    }

    const byteLength = Math.floor((count * SEXTET_BITS) / 8);

    if (byteLength > MAX_BASE64_INPUT_BYTES) {
        return fail("too_large");
    }

    const bytes = new Uint8Array(byteLength);
    let cursor = 0;

    for (let index = 0; index + 1 < count; index += 4) {
        const available = Math.min(4, count - index);
        let chunk = 0;

        for (let slot = 0; slot < 4; slot += 1) {
            chunk = (chunk << SEXTET_BITS) | (slot < available ? sextets[index + slot] : 0);
        }

        for (let slot = 0; slot < available - 1; slot += 1) {
            bytes[cursor] = (chunk >>> (16 - slot * 8)) & 0xff;
            cursor += 1;
        }
    }

    return { ok: true, bytes };
}

/** UTF-8 convenience wrapper; every other set goes through `text-codec`. */
export function decodeToText(input: string): Base64DecodeTextResult {
    const decoded = decodeToBytes(input);

    return decoded.ok ? bytesToText(decoded.bytes, "utf-8") : decoded;
}

/* ----------------------------------------------------------------- sizes --- */

function roundToTenth(value: number): number {
    return Math.round(value * 10) / 10;
}

/** Locale-free size split into a number and a unit key the UI translates. */
export function describeByteSize(bytes: number): ByteSize {
    if (bytes < BYTES_PER_KILOBYTE) {
        return { value: bytes, unit: "b" };
    }

    if (bytes < BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE) {
        return { value: roundToTenth(bytes / BYTES_PER_KILOBYTE), unit: "kb" };
    }

    return {
        value: roundToTenth(bytes / (BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE)),
        unit: "mb",
    };
}

export function exceedsInputLimit(byteLength: number): boolean {
    return byteLength > MAX_BASE64_INPUT_BYTES;
}
