import { base64ToBytes, bytesToBase64 } from "@/modules/tools/domain/base64";
import { bytesToHex, hexToBytes } from "@/modules/tools/domain/hex";
import {
    AES_CIPHER_ENCODINGS,
    AES_KEY_SOURCES,
    AES_TEXT_ENCODINGS,
    type AesCipherEncoding,
    type AesKeySource,
    type AesTextEncoding,
    type CipherBytes,
} from "../types";

/**
 * The three ways a payload can be written, in both directions.
 *
 * `null` rather than a throw throughout: a pasted string that does not parse is
 * ordinary input, and the caller turns it into a named refusal with the box's
 * own vocabulary.
 */

/**
 * The two pickers hand back a bare string, because a `<Select>` deals in
 * strings. These narrow it once, at the boundary, rather than casting.
 */
export function isTextEncoding(value: string): value is AesTextEncoding {
    return (AES_TEXT_ENCODINGS as readonly string[]).includes(value);
}

export function isCipherEncoding(value: string): value is AesCipherEncoding {
    return (AES_CIPHER_ENCODINGS as readonly string[]).includes(value);
}

export function isKeySource(value: string): value is AesKeySource {
    return (AES_KEY_SOURCES as readonly string[]).includes(value);
}

/** Hex and base64 arrive wrapped from logs and terminals; whitespace is noise. */
function compact(text: string): string {
    return text.replace(/\s+/g, "");
}

export function decodeText(text: string, encoding: AesTextEncoding): CipherBytes | null {
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
export function encodeText(bytes: Uint8Array, encoding: AesTextEncoding): string | null {
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

export function decodeCipher(text: string, encoding: AesCipherEncoding): CipherBytes | null {
    return encoding === "hex" ? hexToBytes(compact(text)) : base64ToBytes(text);
}

export function encodeCipher(bytes: Uint8Array, encoding: AesCipherEncoding): string {
    return encoding === "hex" ? bytesToHex(bytes) : bytesToBase64(bytes);
}
