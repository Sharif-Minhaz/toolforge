import {
    ARGON2_VARIANTS,
    DIGEST_ALGORITHMS,
    type Argon2Variant,
    type DigestAlgorithm,
    type DigestEncoding,
    type HashAlgorithm,
    type HashFamily,
    type HashOptions,
} from "../types";
import {
    MAX_ARGON2_HASH_LENGTH,
    MAX_ARGON2_ITERATIONS,
    MAX_ARGON2_MEMORY,
    MAX_ARGON2_PARALLELISM,
    MAX_BCRYPT_COST,
    MIN_ARGON2_HASH_LENGTH,
    MIN_ARGON2_ITERATIONS,
    MIN_ARGON2_MEMORY,
    MIN_ARGON2_PARALLELISM,
    MIN_BCRYPT_COST,
} from "./constants";

/**
 * How each algorithm is written. These are proper names — `SHA-256` reads the
 * same in Bangla as in English — so they stay out of the message catalogue.
 */
export const ALGORITHM_LABELS: Record<HashAlgorithm, string> = {
    md5: "MD5",
    sha1: "SHA-1",
    sha256: "SHA-256",
    sha512: "SHA-512",
    bcrypt: "bcrypt",
    argon2id: "Argon2id",
    argon2i: "Argon2i",
    argon2d: "Argon2d",
};

/** Format names, likewise data rather than copy. */
export const ENCODING_LABELS: Record<DigestEncoding, string> = {
    hex: "Hex",
    base64: "Base64",
};

export function isDigestAlgorithm(algorithm: HashAlgorithm): algorithm is DigestAlgorithm {
    return (DIGEST_ALGORITHMS as readonly string[]).includes(algorithm);
}

export function isArgon2Variant(algorithm: HashAlgorithm): algorithm is Argon2Variant {
    return (ARGON2_VARIANTS as readonly string[]).includes(algorithm);
}

export function getHashFamily(algorithm: HashAlgorithm): HashFamily {
    if (algorithm === "bcrypt") {
        return "bcrypt";
    }

    return isArgon2Variant(algorithm) ? "argon2" : "digest";
}

/**
 * Digests that are broken for anything an adversary can influence. Both still
 * have honest uses — checking a download against a published sum, keying a
 * cache — so they stay selectable and the UI warns in place instead.
 */
export function isCollisionBroken(algorithm: HashAlgorithm): boolean {
    return algorithm === "md5" || algorithm === "sha1";
}

/**
 * Whether the algorithm is built to be slow. A fast digest over a password is
 * the single most common mistake this tool exists to make visible.
 */
export function isPasswordHash(algorithm: HashAlgorithm): boolean {
    return getHashFamily(algorithm) !== "digest";
}

/**
 * Hex is the only encoding a case toggle means anything under — base64 is
 * case-significant, so upper-casing it produces a different, wrong value.
 */
export function supportsCaseToggle(options: HashOptions): boolean {
    return getHashFamily(options.algorithm) === "digest" && options.encoding === "hex";
}

/** bcrypt and Argon2 emit their own `$`-delimited encoding, parameters and all. */
export function supportsEncodingChoice(options: HashOptions): boolean {
    return getHashFamily(options.algorithm) === "digest";
}

export function isValidBcryptCost(cost: number): boolean {
    return Number.isInteger(cost) && cost >= MIN_BCRYPT_COST && cost <= MAX_BCRYPT_COST;
}

/**
 * Argon2 rejects a memory cost below `8 * parallelism`, so the lanes and the
 * memory constrain each other rather than each having a fixed floor.
 */
export function isValidArgon2Parameters(options: HashOptions): boolean {
    const { argon2Memory, argon2Iterations, argon2Parallelism, argon2HashLength } = options;

    if (
        !Number.isInteger(argon2Memory) ||
        !Number.isInteger(argon2Iterations) ||
        !Number.isInteger(argon2Parallelism) ||
        !Number.isInteger(argon2HashLength)
    ) {
        return false;
    }

    return (
        argon2Memory >= MIN_ARGON2_MEMORY &&
        argon2Memory <= MAX_ARGON2_MEMORY &&
        argon2Memory >= 8 * argon2Parallelism &&
        argon2Iterations >= MIN_ARGON2_ITERATIONS &&
        argon2Iterations <= MAX_ARGON2_ITERATIONS &&
        argon2Parallelism >= MIN_ARGON2_PARALLELISM &&
        argon2Parallelism <= MAX_ARGON2_PARALLELISM &&
        argon2HashLength >= MIN_ARGON2_HASH_LENGTH &&
        argon2HashLength <= MAX_ARGON2_HASH_LENGTH
    );
}

/** The smallest memory cost the current lane count allows, for the UI's hint. */
export function minimumArgon2Memory(parallelism: number): number {
    return Math.max(MIN_ARGON2_MEMORY, 8 * parallelism);
}
