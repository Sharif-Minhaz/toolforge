import type { DigestEncoding } from "../types";

const HEX_PATTERN = /^[0-9a-f]+$/i;

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

export function bytesToHex(bytes: Uint8Array): string {
    let hex = "";

    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, "0");
    }

    return hex;
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

export function hexToBytes(hex: string): Uint8Array | null {
    if (hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) {
        return null;
    }

    const bytes = new Uint8Array(hex.length / 2);

    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }

    return bytes;
}

export function isHex(value: string): boolean {
    return value.length > 0 && value.length % 2 === 0 && HEX_PATTERN.test(value);
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
