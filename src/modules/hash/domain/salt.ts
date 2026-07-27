import { bytesToBase64 } from "./encoding";
import { ARGON2_SALT_BYTES, BCRYPT_SALT_BYTES, SALT_SEED_BYTES } from "./constants";
import { getHashFamily } from "./algorithms";
import type { HashAlgorithm } from "../types";

/** Injected in tests so a fixed seed produces a hash that can be asserted on. */
export type RandomBytes = (into: Uint8Array) => Uint8Array;

const defaultRandomBytes: RandomBytes = (into) => crypto.getRandomValues(into);

/**
 * One pool of random bytes per generation, sliced to whatever the chosen family
 * needs. Regenerating reseeds every algorithm at once, so switching between
 * bcrypt and Argon2 does not silently reuse a salt across both.
 */
export function createSaltSeed(random: RandomBytes = defaultRandomBytes): string {
    return bytesToBase64(random(new Uint8Array(SALT_SEED_BYTES)));
}

function decodeSeed(seed: string): Uint8Array {
    const binary = atob(seed);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

/**
 * The salt an algorithm actually receives. bcrypt takes exactly 16 bytes;
 * Argon2 takes at least 8 and is given 16 to match. A seed shorter than the
 * requested width is repeated rather than zero-padded, so a truncated seed
 * cannot quietly become a run of nulls.
 */
export function deriveSalt(seed: string, algorithm: HashAlgorithm): Uint8Array {
    const family = getHashFamily(algorithm);

    if (family === "digest") {
        return new Uint8Array(0);
    }

    const width = family === "bcrypt" ? BCRYPT_SALT_BYTES : ARGON2_SALT_BYTES;
    const source = decodeSeed(seed);

    if (source.length === 0) {
        throw new Error("Salt seed decoded to zero bytes");
    }

    const salt = new Uint8Array(width);

    for (let index = 0; index < width; index += 1) {
        salt[index] = source[index % source.length];
    }

    return salt;
}
