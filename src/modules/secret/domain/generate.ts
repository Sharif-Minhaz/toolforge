import { cryptoRandomBytes } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";
import {
    SECRET_GRADES,
    SECRET_KEY_USES,
    type SecretGrade,
    type SecretKeyUse,
    type SecretOptions,
    type SecretResult,
} from "../types";
import {
    GRADE_THRESHOLD_BITS,
    MAX_SECRET_BYTES,
    MIN_SECRET_BYTES,
    SECRET_KEY_USE_BYTES,
} from "./constants";
import { countCharacters, encodeSecret, supportsPadding } from "./encodings";
import { equivalentCommand } from "./openssl";
import { formatSecret, isValidVariableName, supportsVariableName } from "./shape";

/**
 * The one entry point the island and the MCP adapter both call. Pure given a
 * byte source, so every branch is reachable from a test.
 *
 * Split in two on purpose. `drawSecretBytes` is the only part that consumes
 * randomness; `describeSecret` spells bytes it is handed. That is what lets the
 * workbench change the encoding, the padding and the shape without drawing a
 * new secret — the reader picked a value, and switching from hex to base64url
 * is a question about how to write it down, not a request for a different one.
 */

/* -------------------------------------------------------------- drawing --- */

export function isValidByteLength(byteLength: number): boolean {
    return (
        Number.isInteger(byteLength) &&
        byteLength >= MIN_SECRET_BYTES &&
        byteLength <= MAX_SECRET_BYTES
    );
}

/** Keeps a value inside the range when something outside moved the bound. */
export function clampByteLength(byteLength: number): number {
    if (!Number.isFinite(byteLength)) {
        return MIN_SECRET_BYTES;
    }

    return Math.min(MAX_SECRET_BYTES, Math.max(MIN_SECRET_BYTES, Math.trunc(byteLength)));
}

/**
 * `null` rather than a throw for a length outside the range, because the caller
 * that gets one is holding a number a person typed.
 */
export function drawSecretBytes(
    byteLength: number,
    randomBytes: RandomBytes = cryptoRandomBytes,
): Uint8Array | null {
    return isValidByteLength(byteLength) ? randomBytes(byteLength) : null;
}

/* -------------------------------------------------------------- grading --- */

/**
 * Exact, and worth being exact about: a byte from a CSPRNG carries eight bits
 * of entropy, so the figure is a multiplication rather than the estimate a
 * password generator has to make. Nothing about the encoding changes it — the
 * same 32 bytes are 256 bits whether they are printed as 43 characters or 64.
 */
export function entropyBits(byteLength: number): number {
    return byteLength * 8;
}

export function gradeSecret(bits: number): SecretGrade {
    // Walked from the top so the first band it clears is the one it gets.
    return (
        SECRET_GRADES.toReversed().find((grade) => bits >= GRADE_THRESHOLD_BITS[grade]) ??
        "below-recommended"
    );
}

/**
 * Algorithms whose key size is exactly this many bytes.
 *
 * Exact rather than "at least", because that is the only claim worth making: a
 * 40-byte key is not an AES-256 key with eight bytes spare, it is a value AES
 * cannot take. Returns an empty list for the sizes that match nothing, which is
 * most of them, and the UI shows nothing rather than reaching for the nearest.
 */
export function keyUses(byteLength: number): readonly SecretKeyUse[] {
    return SECRET_KEY_USES.filter((use) => SECRET_KEY_USE_BYTES[use] === byteLength);
}

/* ------------------------------------------------------------ describing --- */

/**
 * Bytes plus the settings, spelled out. The bytes are never echoed back — a
 * caller that wants them again already has them.
 */
export function describeSecret(bytes: Uint8Array, options: SecretOptions): SecretResult {
    if (!isValidByteLength(bytes.length)) {
        return { ok: false, reason: "invalid_length" };
    }

    if (supportsVariableName(options.shape) && !isValidVariableName(options.variableName)) {
        return { ok: false, reason: "invalid_variable_name" };
    }

    // Normalised once, here, so the flag the caller sent can never disagree
    // with what the encoder did or with what the command line claims.
    const padded = supportsPadding(options.encoding) && options.padded;
    const secret = encodeSecret(bytes, options.encoding, padded);
    const bits = entropyBits(bytes.length);

    return {
        ok: true,
        secret,
        formatted: formatSecret(secret, options.shape, options.variableName),
        byteLength: bytes.length,
        entropyBits: bits,
        grade: gradeSecret(bits),
        uses: keyUses(bytes.length),
        characterCount: countCharacters(bytes.length, options.encoding, padded),
        command: equivalentCommand(bytes.length, options.encoding, padded),
    };
}

/** Draw and describe in one call, for callers with nothing to preserve. */
export function generateSecret(
    options: SecretOptions,
    randomBytes: RandomBytes = cryptoRandomBytes,
): SecretResult {
    const bytes = drawSecretBytes(options.byteLength, randomBytes);

    if (bytes === null) {
        return { ok: false, reason: "invalid_length" };
    }

    return describeSecret(bytes, options);
}
