import {
    ARGON2_VARIANTS,
    BCRYPT_PREFIXES,
    DIGEST_ALGORITHMS,
    type Argon2Variant,
    type BcryptPrefix,
    type DetectedHash,
    type DigestAlgorithm,
} from "../types";
import { DIGEST_BASE64_LENGTHS, DIGEST_HEX_LENGTHS } from "./digest";
import { isHex } from "@/modules/tools/domain/hex";
import { isBase64 } from "./encoding";

/** `$2b$12$` followed by 53 characters of bcrypt-base64 salt and hash. */
const BCRYPT_PATTERN = /^\$2[abxy]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

/** `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`, both parts base64 unpadded. */
const ARGON2_PATTERN =
    /^\$(argon2(?:id|i|d))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function detectBcrypt(value: string): DetectedHash | null {
    const match = BCRYPT_PATTERN.exec(value);

    if (match === null) {
        return null;
    }

    const prefix = value.slice(0, 4) as BcryptPrefix;

    if (!(BCRYPT_PREFIXES as readonly string[]).includes(prefix)) {
        return null;
    }

    return { family: "bcrypt", prefix, cost: Number.parseInt(match[1], 10) };
}

function detectArgon2(value: string): DetectedHash | null {
    const match = ARGON2_PATTERN.exec(value);

    if (match === null) {
        return null;
    }

    const variant = match[1] as Argon2Variant;

    if (!(ARGON2_VARIANTS as readonly string[]).includes(variant)) {
        return null;
    }

    return {
        family: "argon2",
        variant,
        version: Number.parseInt(match[2], 10),
        memory: Number.parseInt(match[3], 10),
        iterations: Number.parseInt(match[4], 10),
        parallelism: Number.parseInt(match[5], 10),
    };
}

/**
 * Digests carry no marker, so length is the only signal. Every algorithm in
 * this set has a distinct output size, which makes the mapping unambiguous
 * here — it does not make it unambiguous in general. A 32-character hex string
 * is equally an MD5, an MD4, or an NTLM hash, and the article says so.
 */
function detectDigest(value: string): DetectedHash | null {
    if (isHex(value)) {
        const algorithm = (DIGEST_ALGORITHMS as readonly DigestAlgorithm[]).find(
            (candidate) => DIGEST_HEX_LENGTHS[candidate] === value.length,
        );

        return algorithm === undefined ? null : { family: "digest", algorithm, encoding: "hex" };
    }

    if (isBase64(value)) {
        const algorithm = (DIGEST_ALGORITHMS as readonly DigestAlgorithm[]).find(
            (candidate) => DIGEST_BASE64_LENGTHS[candidate] === value.length,
        );

        return algorithm === undefined ? null : { family: "digest", algorithm, encoding: "base64" };
    }

    return null;
}

/**
 * What a pasted string is, or `null` when nothing here recognises it. Ordered
 * most-specific first: the `$`-delimited formats declare themselves, so they
 * are settled before anything is inferred from length alone.
 */
export function detectHash(value: string): DetectedHash | null {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return null;
    }

    return detectBcrypt(trimmed) ?? detectArgon2(trimmed) ?? detectDigest(trimmed);
}
