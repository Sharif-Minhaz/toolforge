/**
 * Base64url as JOSE uses it: RFC 4648 §5 alphabet, padding stripped. Kept
 * separate from the Base64 tool's codec on purpose — that one is configurable
 * across alphabets and padding, while a JWT segment has exactly one legal
 * shape, and a lenient reader here would hide malformed tokens instead of
 * reporting them.
 */

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

export type Base64UrlFailureReason = "invalid_character" | "invalid_length" | "undecodable_text";

export type Base64UrlBytesResult =
    | { readonly ok: true; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly reason: Base64UrlFailureReason };

export type Base64UrlTextResult =
    | { readonly ok: true; readonly text: string }
    | { readonly ok: false; readonly reason: Base64UrlFailureReason };

function restorePadding(segment: string): string {
    const width = Math.ceil(segment.length / 4) * 4;

    return segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(width, "=");
}

export function decodeBase64UrlToBytes(segment: string): Base64UrlBytesResult {
    if (!BASE64URL_PATTERN.test(segment)) {
        return { ok: false, reason: "invalid_character" };
    }

    // Four base64 characters carry three bytes, so a remainder of one leaves a
    // dangling six bits that cannot belong to any byte.
    if (segment.length % 4 === 1) {
        return { ok: false, reason: "invalid_length" };
    }

    try {
        const binary = atob(restorePadding(segment));

        return { ok: true, bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
    } catch {
        return { ok: false, reason: "invalid_character" };
    }
}

export function decodeBase64UrlToText(segment: string): Base64UrlTextResult {
    const decoded = decodeBase64UrlToBytes(segment);

    if (!decoded.ok) {
        return decoded;
    }

    try {
        // `fatal` so a segment holding arbitrary bytes is reported rather than
        // silently peppered with replacement characters.
        return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(decoded.bytes) };
    } catch {
        return { ok: false, reason: "undecodable_text" };
    }
}

export function encodeBytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function encodeTextToBase64Url(text: string): string {
    return encodeBytesToBase64Url(new TextEncoder().encode(text));
}
