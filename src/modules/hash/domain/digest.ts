import { createMD5, createSHA1, createSHA256, createSHA512 } from "hash-wasm";

import type { DigestAlgorithm, DigestEncoding } from "../types";
import { encodeDigest } from "./encoding";

type Hasher = { update: (data: string) => unknown; digest: (outputType: "binary") => Uint8Array };

const FACTORIES: Record<DigestAlgorithm, () => Promise<Hasher>> = {
    md5: createMD5,
    sha1: createSHA1,
    sha256: createSHA256,
    sha512: createSHA512,
};

/** Hex digits per digest, which is what makes a pasted digest identifiable. */
export const DIGEST_HEX_LENGTHS: Record<DigestAlgorithm, number> = {
    md5: 32,
    sha1: 40,
    sha256: 64,
    sha512: 128,
};

/**
 * Base64 length including padding. Every digest here is a whole number of
 * bytes, so these are fixed and unambiguous within this set.
 */
export const DIGEST_BASE64_LENGTHS: Record<DigestAlgorithm, number> = {
    md5: 24,
    sha1: 28,
    sha256: 44,
    sha512: 88,
};

/**
 * The streaming interface rather than the one-shot helper: the one-shot only
 * returns hex, and base64 output has to come from the raw bytes.
 */
export async function digestBytes(text: string, algorithm: DigestAlgorithm): Promise<Uint8Array> {
    const hasher = await FACTORIES[algorithm]();

    hasher.update(text);

    return hasher.digest("binary");
}

export async function digestText(
    text: string,
    algorithm: DigestAlgorithm,
    encoding: DigestEncoding,
    uppercase = false,
): Promise<string> {
    const encoded = encodeDigest(await digestBytes(text, algorithm), encoding);

    // Only hex has a meaningless case; base64 is case-significant and upper-
    // casing it would produce a different, wrong value.
    return encoding === "hex" && uppercase ? encoded.toUpperCase() : encoded;
}
