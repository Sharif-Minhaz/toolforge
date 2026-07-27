import type { CompareFailure, CompareResult, DetectedHash } from "../types";
import { BCRYPT_MAX_PASSWORD_BYTES, MAX_HASH_INPUT_LENGTH } from "./constants";
import { detectHash } from "./detect";
import { digestText } from "./digest";
import { timingSafeEqual, utf8ByteLength } from "./encoding";
import { verifyArgon2, verifyBcrypt } from "./password";

export type CompareRequest = {
    /** A plaintext to check, or a second hash to compare for equality. */
    readonly left: string;
    /** The hash being checked against. Its format decides which check runs. */
    readonly right: string;
};

function failure(reason: CompareFailure["reason"]): CompareFailure {
    return { ok: false, reason };
}

/**
 * Hex is case-insensitive, base64 is not. Normalising both to lower case would
 * make two different base64 digests look equal.
 */
function normalizeDigest(value: string, detected: DetectedHash): string {
    const trimmed = value.trim();

    return detected.family === "digest" && detected.encoding === "hex"
        ? trimmed.toLowerCase()
        : trimmed;
}

/**
 * The single rule the whole compare mode follows:
 *
 * 1. Read the right-hand box. Whatever it turns out to be decides the check —
 *    it is the thing being checked against, so it is the thing that knows what
 *    algorithm and parameters are in play.
 * 2. If it is a bcrypt or Argon2 hash, the left-hand box is a password and the
 *    KDF's own verifier runs. The parameters come out of the hash, never from
 *    the generator's settings.
 * 3. If it is a bare digest, and the left-hand box is a digest of exactly the
 *    same shape, the two are compared for equality.
 * 4. Otherwise the left-hand box is text: it is hashed with the algorithm the
 *    right-hand box was recognised as, and the results are compared.
 *
 * Step 3 before step 4 is the one judgement call. It means a plaintext that
 * happens to be 32 hex characters is read as a digest rather than hashed — rare
 * enough to be worth the rule staying this short, and the UI names which of the
 * two checks it ran so it is never a silent choice.
 */
export async function compareHash(request: CompareRequest): Promise<CompareResult> {
    const left = request.left.trim();
    const right = request.right.trim();

    if (left.length === 0 || right.length === 0) {
        return failure("empty_input");
    }

    if (left.length > MAX_HASH_INPUT_LENGTH || right.length > MAX_HASH_INPUT_LENGTH) {
        return failure("too_large");
    }

    const detected = detectHash(right);

    if (detected === null) {
        return failure("unrecognized_hash");
    }

    if (detected.family === "bcrypt" || detected.family === "argon2") {
        if (
            detected.family === "bcrypt" &&
            utf8ByteLength(request.left) > BCRYPT_MAX_PASSWORD_BYTES
        ) {
            return failure("password_too_long");
        }

        // The password is taken verbatim, not trimmed: leading and trailing
        // whitespace is part of a password, and silently stripping it would
        // report a mismatch as a match.
        const match =
            detected.family === "bcrypt"
                ? await verifyBcrypt(request.left, right)
                : await verifyArgon2(request.left, right);

        return { ok: true, kind: "verify", detected, match };
    }

    const leftDetected = detectHash(left);

    if (
        leftDetected !== null &&
        leftDetected.family === "digest" &&
        leftDetected.algorithm === detected.algorithm &&
        leftDetected.encoding === detected.encoding
    ) {
        return {
            ok: true,
            kind: "digest",
            detected,
            match: timingSafeEqual(
                normalizeDigest(left, leftDetected),
                normalizeDigest(right, detected),
            ),
        };
    }

    try {
        const hashed = await digestText(request.left, detected.algorithm, detected.encoding);

        return {
            ok: true,
            kind: "verify",
            detected,
            match: timingSafeEqual(
                normalizeDigest(hashed, detected),
                normalizeDigest(right, detected),
            ),
        };
    } catch {
        return failure("comparison_failed");
    }
}
