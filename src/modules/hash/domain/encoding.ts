import { bytesToHex } from "@/modules/tools/domain/hex";
import type { DigestEncoding } from "../types";

/**
 * Standard base64 with optional padding. Digests are fixed-length, so a hash
 * pasted from one tool arrives padded and from another unpadded.
 */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function utf8Bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

/** bcrypt's 72-byte rule counts bytes, so a multi-byte character costs more. */
export function utf8ByteLength(text: string): number {
    return utf8Bytes(text).length;
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

export function isBase64(value: string): boolean {
    return value.length > 0 && value.length % 4 === 0 && BASE64_PATTERN.test(value);
}

export function encodeDigest(bytes: Uint8Array, encoding: DigestEncoding): string {
    return encoding === "hex" ? bytesToHex(bytes) : bytesToBase64(bytes);
}

/**
 * Compares two hash strings without leaking where they first diverge. The
 * threat model for a browser tool barely justifies it, but the alternative is
 * shipping a comparison that models bad practice on a page that teaches it.
 *
 * Length is compared up front on purpose: for fixed-width digests it is public
 * information, and hiding it would mean hashing both sides first.
 */
export function timingSafeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }

    let difference = 0;

    for (let index = 0; index < left.length; index += 1) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }

    return difference === 0;
}
