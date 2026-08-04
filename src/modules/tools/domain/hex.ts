/**
 * Hexadecimal over raw bytes.
 *
 * Lifted out of the Hash tool the moment a second caller needed it: a digest is
 * printed as hex, and a BSON document pasted from `bsondump` or a driver log
 * arrives as hex too. Neither tool owns the notation, so it lives here.
 *
 * Reading is deliberately strict — an odd length or a stray character is a
 * failure, not something to normalise. A half-byte has no defensible reading,
 * and guessing one turns a typo into a document nobody wrote.
 */

const HEX_PATTERN = /^[0-9a-f]+$/i;

export function bytesToHex(bytes: Uint8Array): string {
    let hex = "";

    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, "0");
    }

    return hex;
}

/** `null` rather than a throw: a pasted string being wrong is expected input. */
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
