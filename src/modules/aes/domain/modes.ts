import { hexToBytes } from "@/modules/tools/domain/hex";
import { CTR_COUNTER_BITS, MAX_GCM_NONCE_BYTES, MIN_GCM_NONCE_BYTES } from "./constants";
import type { CipherBytes } from "@/modules/tools/types";
import type { AesMode, GcmTagLength } from "../types";

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
 * Whether the mode lets the nonce be a width other than the one drawn.
 *
 * Only GCM. CBC chains a full block into the next and CTR counts inside one, so
 * for both the IV *is* a block and sixteen bytes is arithmetic rather than
 * convention. GCM takes a nonce of any length — twelve directly, anything else
 * through GHASH first — which is why systems disagree about it and why this
 * tool has to accept what they chose.
 */
export function acceptsVariableIv(mode: AesMode): boolean {
    return mode === "gcm";
}

/** The widest IV the field should let anybody type, per mode. */
export function maxIvBytesFor(mode: AesMode): number {
    return acceptsVariableIv(mode) ? MAX_GCM_NONCE_BYTES : ivBytesFor(mode);
}

/**
 * The IV as bytes, or `null` when it is not hex or not a width the mode can
 * take. One reader for both the cipher and the field that shows it invalid, so
 * the box can never look accepted while the operation refuses it.
 */
export function readIvBytes(mode: AesMode, ivHex: string): CipherBytes | null {
    const bytes = hexToBytes(ivHex.replace(/\s+/g, ""));

    if (bytes === null) {
        return null;
    }

    if (!acceptsVariableIv(mode)) {
        return bytes.length === ivBytesFor(mode) ? bytes : null;
    }

    const withinRange = bytes.length >= MIN_GCM_NONCE_BYTES && bytes.length <= MAX_GCM_NONCE_BYTES;

    return withinRange ? bytes : null;
}

/**
 * Whether this engine will actually take a nonce of that width.
 *
 * Runtimes disagree below twelve bytes — Node refuses, Bun accepts — so the
 * range above stays a static rule and the difference is absorbed here, by doing
 * the thing rather than by reading a property. Cached per width, because the
 * answer cannot change within a session and the probe is a real encryption.
 */
const nonceSupport = new Map<number, boolean>();

export async function isIvLengthSupported(mode: AesMode, length: number): Promise<boolean> {
    if (!acceptsVariableIv(mode) || length === ivBytesFor(mode)) {
        return true;
    }

    const cached = nonceSupport.get(length);

    if (cached !== undefined) {
        return cached;
    }

    let supported: boolean;

    try {
        const key = await crypto.subtle.importKey(
            "raw",
            new Uint8Array(16),
            { name: "AES-GCM" },
            false,
            ["encrypt"],
        );

        await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: new Uint8Array(length) },
            key,
            new Uint8Array(1),
        );
        supported = true;
    } catch {
        supported = false;
    }

    nonceSupport.set(length, supported);

    return supported;
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
