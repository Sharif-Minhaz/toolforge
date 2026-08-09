import { base64ToBytes, bytesToBase64 } from "./base64";
import { bytesToHex, hexToBytes } from "./hex";
import {
    PAYLOAD_BINARY_ENCODINGS,
    PAYLOAD_TEXT_ENCODINGS,
    type CipherBytes,
    type PayloadBinaryEncoding,
    type PayloadTextEncoding,
} from "../types";

/**
 * The three ways a payload can be written, in both directions.
 *
 * Lifted out of the AES tool the moment a second cipher needed it: RSA-OAEP has
 * the same two boxes with the same two pickers over them, and a second copy of
 * this would be two chances to disagree about what "hex" tolerates.
 *
 * `null` rather than a throw throughout: a pasted string that does not parse is
 * ordinary input, and the caller turns it into a named refusal in its own box's
 * vocabulary.
 */

/**
 * The pickers hand back a bare string, because a `<Select>` deals in strings.
 * These narrow it once, at the boundary, rather than casting.
 */
export function isTextEncoding(value: string): value is PayloadTextEncoding {
    return (PAYLOAD_TEXT_ENCODINGS as readonly string[]).includes(value);
}

export function isBinaryEncoding(value: string): value is PayloadBinaryEncoding {
    return (PAYLOAD_BINARY_ENCODINGS as readonly string[]).includes(value);
}

/** Hex and base64 arrive wrapped from logs and terminals; whitespace is noise. */
function compact(text: string): string {
    return text.replace(/\s+/g, "");
}

export function decodeText(text: string, encoding: PayloadTextEncoding): CipherBytes | null {
    if (encoding === "utf-8") {
        return new TextEncoder().encode(text);
    }

    return encoding === "hex" ? hexToBytes(compact(text)) : base64ToBytes(text);
}

/**
 * `null` under UTF-8 when the bytes are not text in it — which is exactly what
 * decrypting with the wrong key produces, and the one signal an unauthenticated
 * mode gives you that something went wrong.
 */
export function encodeText(bytes: Uint8Array, encoding: PayloadTextEncoding): string | null {
    if (encoding === "hex") {
        return bytesToHex(bytes);
    }

    if (encoding === "base64") {
        return bytesToBase64(bytes);
    }

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

export function decodeBinary(text: string, encoding: PayloadBinaryEncoding): CipherBytes | null {
    return encoding === "hex" ? hexToBytes(compact(text)) : base64ToBytes(text);
}

export function encodeBinary(bytes: Uint8Array, encoding: PayloadBinaryEncoding): string {
    return encoding === "hex" ? bytesToHex(bytes) : bytesToBase64(bytes);
}
