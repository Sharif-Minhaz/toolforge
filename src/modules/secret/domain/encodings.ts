import {
    bytesToBase64,
    STANDARD_BASE64_ALPHABET,
    URL_SAFE_BASE64_ALPHABET,
} from "@/modules/tools/domain/base64";
import { bytesToHex } from "@/modules/tools/domain/hex";
import type { SecretEncoding } from "../types";
import { bytesToBase32 } from "./base32";

/**
 * One switch, four spellings of the same bytes.
 *
 * Three of the four are already owned elsewhere: base64 in both alphabets came
 * out of the Base64 tool and hex out of the Hash tool, and both were lifted to
 * `tools/domain/` the first time a second caller wanted them. Only base32 is
 * new, and it stays local until something else asks for it.
 */
export function encodeSecret(bytes: Uint8Array, encoding: SecretEncoding, padded: boolean): string {
    switch (encoding) {
        case "base64url":
            return bytesToBase64(bytes, URL_SAFE_BASE64_ALPHABET, padded);
        case "base64":
            return bytesToBase64(bytes, STANDARD_BASE64_ALPHABET, padded);
        case "base32":
            return bytesToBase32(bytes, padded);
        case "hex":
            return bytesToHex(bytes);
    }
}

/**
 * Whether the padding switch means anything for this encoding.
 *
 * One predicate rather than a pair of comparisons at each call site, because
 * the domain and the UI have to agree: the workbench disables the control and
 * says why, and the encoder ignores the flag. Hex spends exactly two characters
 * per byte and so never has a partial group to pad.
 */
export function supportsPadding(encoding: SecretEncoding): boolean {
    return encoding !== "hex";
}

/**
 * How many characters an encoding spends on `byteLength` bytes.
 *
 * Counted rather than measured off the finished string, so the workbench can
 * show the cost of an encoding the reader has not switched to yet.
 */
export function countCharacters(
    byteLength: number,
    encoding: SecretEncoding,
    padded: boolean,
): number {
    switch (encoding) {
        case "hex":
            return byteLength * 2;
        case "base32":
            return padded ? Math.ceil(byteLength / 5) * 8 : Math.ceil((byteLength * 8) / 5);
        case "base64":
        case "base64url":
            return padded ? Math.ceil(byteLength / 3) * 4 : Math.ceil((byteLength * 8) / 6);
    }
}
