import { HASH_BYTES } from "./constants";
import type { RsaCryptHash } from "../types";

/**
 * How many bytes of ciphertext one RSA operation produces, which is the modulus
 * rounded up to whole bytes and never anything else. RSA does not stream: one
 * operation in, one modulus-wide block out, whatever the message was.
 */
export function rsaCiphertextBytes(modulusBits: number): number {
    return Math.ceil(modulusBits / 8);
}

/**
 * The largest message OAEP can carry under this key, from RFC 8017 §7.1.1:
 * `k - 2·hLen - 2`, where `k` is the modulus in bytes and `hLen` the digest.
 *
 * Two digests of overhead, not one — OAEP hashes the (empty) label into the data
 * block *and* spends a seed of the same width — plus a single leading zero byte
 * that keeps the encoded message below the modulus.
 *
 * `null` when that arithmetic goes negative, which is a real combination rather
 * than a hypothetical: a 1024-bit key with SHA-512 needs 130 bytes of overhead
 * inside a 128-byte modulus, so it cannot encrypt an empty message, let alone a
 * useful one. That is its own refusal — `hash_too_large_for_key` — because
 * telling somebody to shorten a message would be advice they cannot act on.
 */
export function maxOaepMessageBytes(modulusBits: number, hash: RsaCryptHash): number | null {
    const limit = rsaCiphertextBytes(modulusBits) - 2 * HASH_BYTES[hash] - 2;

    return limit < 0 ? null : limit;
}

/**
 * The smallest modulus this digest can be used with at all — the width at which
 * `maxOaepMessageBytes` stops being negative. Shown in the refusal so a reader
 * is told which way out they have: a bigger key, or a smaller digest.
 */
export function minModulusBitsFor(hash: RsaCryptHash): number {
    return (2 * HASH_BYTES[hash] + 2) * 8;
}
