import { base64ToBytes } from "@/modules/tools/domain/base64";
import { hexToBytes } from "@/modules/tools/domain/hex";
import {
    MAX_AES_SECRET_LENGTH,
    MAX_PBKDF2_ITERATIONS,
    MAX_SALT_BYTES,
    MIN_PBKDF2_ITERATIONS,
    MIN_SALT_BYTES,
    PBKDF2_HASH,
} from "./constants";
import {
    AES_KEY_SIZES,
    GCM_TAG_LENGTHS,
    type AesKeyInput,
    type AesKeyResult,
    type AesKeySize,
    type AesKeySource,
    type CipherBytes,
    type GcmTagLength,
} from "../types";

/**
 * Turning what was typed into key bytes.
 *
 * Split out from the cipher because it is the expensive half — six hundred
 * thousand PBKDF2 rounds is most of a second — and because it depends on far
 * less than the cipher does. `aesKeyCacheKey` names exactly what it depends on,
 * so a caller can memoise the derivation and let the payload change freely
 * without paying for it again.
 */

export function usesKeyDerivation(source: AesKeySource): boolean {
    return source === "passphrase";
}

/** The picker deals in strings, so the width is narrowed once, at that boundary. */
export function isAesKeySize(value: number): value is AesKeySize {
    return (AES_KEY_SIZES as readonly number[]).includes(value);
}

export function isGcmTagLength(value: number): value is GcmTagLength {
    return (GCM_TAG_LENGTHS as readonly number[]).includes(value);
}

/**
 * Everything the derived bytes are a function of, and nothing else. A raw key
 * ignores the salt and the iteration count, so neither appears in its key —
 * redrawing the salt must not throw away a key that did not depend on it.
 */
export function aesKeyCacheKey(input: AesKeyInput): string {
    return usesKeyDerivation(input.source)
        ? JSON.stringify([
              input.source,
              input.secret,
              input.saltHex.trim().toLowerCase(),
              input.iterations,
              input.keySize,
          ])
        : JSON.stringify([input.source, input.secret.trim(), input.keySize]);
}

/** Whitespace is how a hex or base64 value arrives from a log or a terminal. */
function compact(text: string): string {
    return text.replace(/\s+/g, "");
}

function readRawKey(input: AesKeyInput): AesKeyResult {
    const expectedBytes = input.keySize / 8;
    const bytes =
        input.source === "hex" ? hexToBytes(compact(input.secret)) : base64ToBytes(input.secret);

    if (bytes === null) {
        return { ok: false, reason: "invalid_key_encoding" };
    }

    // A key of the wrong width is never coerced. Padding it with zeros or
    // truncating it would produce a key nobody chose, under a name that says
    // otherwise.
    if (bytes.length !== expectedBytes) {
        return {
            ok: false,
            reason: "invalid_key_length",
            actualBytes: bytes.length,
            expectedBytes,
        };
    }

    return { ok: true, bytes };
}

export function readSaltBytes(saltHex: string): CipherBytes | null {
    const bytes = hexToBytes(compact(saltHex));

    if (bytes === null || bytes.length < MIN_SALT_BYTES || bytes.length > MAX_SALT_BYTES) {
        return null;
    }

    return bytes;
}

export function isValidIterationCount(iterations: number): boolean {
    return (
        Number.isInteger(iterations) &&
        iterations >= MIN_PBKDF2_ITERATIONS &&
        iterations <= MAX_PBKDF2_ITERATIONS
    );
}

export async function resolveAesKey(input: AesKeyInput): Promise<AesKeyResult> {
    if (input.secret.length === 0) {
        return { ok: false, reason: "empty_key" };
    }

    if (input.secret.length > MAX_AES_SECRET_LENGTH) {
        return { ok: false, reason: "key_too_large" };
    }

    if (!usesKeyDerivation(input.source)) {
        return readRawKey(input);
    }

    const salt = readSaltBytes(input.saltHex);

    if (salt === null) {
        return { ok: false, reason: "invalid_salt" };
    }

    if (!isValidIterationCount(input.iterations)) {
        return { ok: false, reason: "invalid_iterations" };
    }

    try {
        const material = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(input.secret),
            "PBKDF2",
            false,
            ["deriveBits"],
        );
        const derived = await crypto.subtle.deriveBits(
            { name: "PBKDF2", salt, iterations: input.iterations, hash: PBKDF2_HASH },
            material,
            input.keySize,
        );

        return { ok: true, bytes: new Uint8Array(derived) };
    } catch {
        // Every input has already been checked, so reaching here means the
        // engine itself refused. Its own message is deliberately not surfaced.
        return { ok: false, reason: "key_derivation_failed" };
    }
}
