import { hexToBytes } from "@/modules/tools/domain/hex";
import { CTR_COUNTER_BITS } from "./constants";
import type { AesMode, CipherBytes, GcmTagLength } from "../types";

/**
 * What each mode needs and what each mode promises.
 *
 * `ivBytes` is the single rule the rest of the tool branches on: GCM takes a
 * 12-byte nonce, CBC and CTR take a full 16-byte block. Enumerating the pairs
 * anywhere else would be three places to forget one.
 */
type ModeSpec = {
    /** The Web Crypto algorithm name, which is also what `importKey` is given. */
    readonly algorithm: "AES-CBC" | "AES-GCM" | "AES-CTR";
    readonly ivBytes: number;
    /** Whether the mode detects a ciphertext that has been altered. */
    readonly authenticated: boolean;
};

const MODE_SPECS: Record<AesMode, ModeSpec> = {
    cbc: { algorithm: "AES-CBC", ivBytes: 16, authenticated: false },
    gcm: { algorithm: "AES-GCM", ivBytes: 12, authenticated: true },
    ctr: { algorithm: "AES-CTR", ivBytes: 16, authenticated: false },
};

export function aesAlgorithmName(mode: AesMode): ModeSpec["algorithm"] {
    return MODE_SPECS[mode].algorithm;
}

export function ivBytesFor(mode: AesMode): number {
    return MODE_SPECS[mode].ivBytes;
}

export function isAuthenticated(mode: AesMode): boolean {
    return MODE_SPECS[mode].authenticated;
}

/** Whether ciphertext length is constrained to whole blocks, as CBC's is. */
export function isBlockAligned(mode: AesMode): boolean {
    return mode === "cbc";
}

/**
 * The IV as bytes, or `null` when it is not hex or not the width the mode
 * needs. One reader for both the cipher and the field that shows it invalid, so
 * the box can never look accepted while the operation refuses it.
 */
export function readIvBytes(mode: AesMode, ivHex: string): CipherBytes | null {
    const bytes = hexToBytes(ivHex.replace(/\s+/g, ""));

    return bytes === null || bytes.length !== ivBytesFor(mode) ? null : bytes;
}

export function isValidIvHex(mode: AesMode, ivHex: string): boolean {
    return readIvBytes(mode, ivHex) !== null;
}

/**
 * How many bytes of the ciphertext the authentication tag occupies.
 *
 * Zero outside GCM, because no other mode here has one — which is what lets the
 * length floor be written once rather than branched on per mode.
 */
export function tagBytesFor(mode: AesMode, tagLength: GcmTagLength): number {
    return isAuthenticated(mode) ? tagLength / 8 : 0;
}

export function subtleParams(
    mode: AesMode,
    iv: CipherBytes,
    tagLength: GcmTagLength,
): AesCbcParams | AesGcmParams | AesCtrParams {
    if (mode === "ctr") {
        return { name: "AES-CTR", counter: iv, length: CTR_COUNTER_BITS };
    }

    // Passed explicitly even at the default, so the request says what it wants
    // rather than depending on the engine's idea of it.
    return mode === "gcm" ? { name: "AES-GCM", iv, tagLength } : { name: "AES-CBC", iv };
}
