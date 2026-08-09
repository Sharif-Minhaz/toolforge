import type {
    CipherBytes,
    PayloadBinaryEncoding,
    PayloadTextEncoding,
    RsaKeyKind,
} from "@/modules/tools/types";

export const RSA_CRYPT_DIRECTIONS = ["encrypt", "decrypt"] as const;

export type RsaCryptDirection = (typeof RSA_CRYPT_DIRECTIONS)[number];

/**
 * The padding schemes on offer, and there is exactly one.
 *
 * RSAES-PKCS1-v1_5 is deliberately absent, and its absence is a fact about the
 * platform rather than a decision this tool got to make: it is not in the Web
 * Crypto specification, no browser has ever implemented it, and the engines that
 * once did now answer `NotSupportedError: RSAES-PKCS1-v1_5 support is
 * deprecated`. Offering it would mean hand-rolling modular exponentiation and a
 * padding scheme whose whole history is Bleichenbacher's attack on exactly that
 * padding — on a page whose promise is that it does not hand-roll ciphers.
 *
 * The picker is kept as a picker rather than dropped, so the answer to "which
 * padding is this?" is on screen instead of assumed. The article says the rest.
 */
export const RSA_PADDINGS = ["oaep"] as const;

export type RsaPadding = (typeof RSA_PADDINGS)[number];

/** The digests OAEP can be run with. SHA-1 is absent for the same reason it is
 *  absent from the key generator: offering it would be recommending it. */
export const RSA_CRYPT_HASHES = ["SHA-256", "SHA-384", "SHA-512"] as const;

export type RsaCryptHash = (typeof RSA_CRYPT_HASHES)[number];

/** How the pasted key is written. Not which container it is in — the block says. */
export const RSA_KEY_INPUT_FORMATS = ["pem", "der", "jwk"] as const;

export type RsaKeyInputFormat = (typeof RSA_KEY_INPUT_FORMATS)[number];

/**
 * Every way an operation can be refused, each keeping its own name.
 *
 * The three key failures are three different problems and stay three reasons.
 * `unreadable_key` means the text is not a key in the declared format at all;
 * `wrong_key_kind` means it is a perfectly good key of the other sort, which is
 * the single most common mistake here; `key_rejected` means it parsed, said what
 * it was, and Web Crypto still would not take it — a truncated modulus, an
 * elliptic-curve key wearing an RSA header, a JWK missing a field.
 *
 * `message_too_long` and `hash_too_large_for_key` likewise: the first means this
 * message does not fit under this key, and the second means *no* message does,
 * because the digest is wider than the modulus can carry. Folding them together
 * would tell somebody to shorten a message that was never the problem.
 */
export type RsaCryptFailureReason =
    | "no_key"
    | "unreadable_key"
    | "wrong_key_kind"
    | "key_rejected"
    | "hash_too_large_for_key"
    | "no_input"
    | "input_too_large"
    | "invalid_input_encoding"
    | "message_too_long"
    | "encryption_failed"
    | "decryption_failed"
    | "undecodable_text";

export type RsaCryptFailure = {
    readonly ok: false;
    readonly reason: RsaCryptFailureReason;
    /** Bytes the message ran to, set by the two complaints about size. */
    readonly actualBytes?: number;
    /** Bytes it was allowed, set by the same. */
    readonly limitBytes?: number;
    /** Which half the pasted block turned out to be, set by `wrong_key_kind`. */
    readonly foundKind?: RsaKeyKind;
};

export type RsaCryptSuccess = {
    readonly ok: true;
    /** The result rendered in the chosen encoding — what the output box shows. */
    readonly output: string;
    /**
     * The same result as bytes. Carried because a decrypted payload may not be
     * text at all, and rendering it as base64 for the reader to decode somewhere
     * else would be a round trip the tool refuses to finish itself.
     */
    readonly bytes: CipherBytes;
    readonly inputBytes: number;
    readonly outputBytes: number;
    /** Read back off the imported key, for the size meter and the status line. */
    readonly modulusBits: number;
};

export type RsaCryptResult = RsaCryptSuccess | RsaCryptFailure;

/** An imported key, with the one property every ceiling here is computed from. */
export type ImportedRsaKey = {
    readonly key: CryptoKey;
    readonly modulusBits: number;
};

export type RsaKeyImportResult = ({ readonly ok: true } & ImportedRsaKey) | RsaCryptFailure;

/**
 * Everything the two directions can be told to do, beyond the payload and the
 * key. Options that do not apply to the current direction are still carried, so
 * switching away and back does not lose what was set.
 */
export type RsaCryptOptions = {
    readonly keyFormat: RsaKeyInputFormat;
    /**
     * Which half the reader says they have pasted. Under `decrypt` this is
     * forced to `private` — a public key cannot undo what it did — and the
     * toggle is disabled with a hint rather than silently ignored.
     */
    readonly keyKind: RsaKeyKind;
    readonly padding: RsaPadding;
    readonly hash: RsaCryptHash;
    /** Applies to the plaintext side, whichever box that is in this direction. */
    readonly textEncoding: PayloadTextEncoding;
    /** Applies to the ciphertext side, likewise. */
    readonly cipherEncoding: PayloadBinaryEncoding;
};

/**
 * What the input box currently holds: typed text, or an opened file.
 *
 * The two are not symmetric, and deliberately so — the same asymmetry the AES
 * tool has. Encrypting a file takes its bytes as the plaintext, so the plaintext
 * encoding has nothing to act on. Decrypting a file reads it as text, because a
 * ciphertext this tool wrote is hex or base64 in a `.txt`, which is what makes
 * the round trip close.
 */
export type RsaCryptSource =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "file"; readonly name: string; readonly bytes: CipherBytes };

export type RsaCryptRequest = {
    readonly direction: RsaCryptDirection;
    readonly source: RsaCryptSource;
    /** The key exactly as pasted; the domain does the parsing. */
    readonly keyText: string;
    readonly options: RsaCryptOptions;
};

export type RsaCryptExportRequest = {
    readonly direction: RsaCryptDirection;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};

export type RsaCryptBlobExportRequest = {
    readonly direction: RsaCryptDirection;
    readonly bytes: CipherBytes;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
