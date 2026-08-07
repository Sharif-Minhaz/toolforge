export const AES_DIRECTIONS = ["encrypt", "decrypt"] as const;

export type AesDirection = (typeof AES_DIRECTIONS)[number];

/**
 * The three block-cipher modes the Web Crypto API implements.
 *
 * ECB is deliberately absent, and its absence is a design decision rather than
 * an omission: no browser exposes it, so shipping it would mean hand-rolling a
 * block cipher on a page whose whole promise is that it does not — and ECB
 * encrypts identical plaintext blocks to identical ciphertext blocks, which
 * leaks the shape of the data it was supposed to hide.
 */
export const AES_MODES = ["cbc", "gcm", "ctr"] as const;

export type AesMode = (typeof AES_MODES)[number];

export const AES_KEY_SIZES = [128, 192, 256] as const;

export type AesKeySize = (typeof AES_KEY_SIZES)[number];

/**
 * Every authentication tag width the Web Crypto specification lists, in bits,
 * widest first — which is also strongest first, and the order the picker reads.
 *
 * A shorter tag is a straight truncation of the full one, not a different
 * computation, so it is exactly as many bits of forgery resistance as it is
 * long. Ninety-six is common in protocols that count every byte on the wire;
 * thirty-two exists to read what somebody else already wrote.
 */
export const GCM_TAG_LENGTHS = [128, 120, 112, 104, 96, 64, 32] as const;

export type GcmTagLength = (typeof GCM_TAG_LENGTHS)[number];

/**
 * Where the key comes from. `passphrase` runs PBKDF2 over what was typed;
 * the other two take the key itself, already the right number of bytes, and
 * therefore ignore the salt and the iteration count entirely.
 */
export const AES_KEY_SOURCES = ["passphrase", "hex", "base64"] as const;

export type AesKeySource = (typeof AES_KEY_SOURCES)[number];

/** How the plaintext side of the operation is written. */
export const AES_TEXT_ENCODINGS = ["utf-8", "hex", "base64"] as const;

export type AesTextEncoding = (typeof AES_TEXT_ENCODINGS)[number];

/** How the ciphertext side is written. Never UTF-8: ciphertext is not text. */
export const AES_CIPHER_ENCODINGS = ["hex", "base64"] as const;

export type AesCipherEncoding = (typeof AES_CIPHER_ENCODINGS)[number];

/**
 * Every way an operation can be refused, each keeping its own name.
 *
 * `authentication_failed` and `decryption_failed` are two different things and
 * stay two different reasons: the first means GCM checked the tag and the
 * ciphertext had been altered or the key was wrong, and the second means the
 * cipher itself could not finish. Folding them together would hide the one
 * piece of information an authenticated mode exists to give you.
 */
export type AesFailureReason =
    | "empty_input"
    | "empty_key"
    | "too_large"
    | "key_too_large"
    | "invalid_input_encoding"
    | "invalid_key_encoding"
    | "invalid_key_length"
    | "invalid_salt"
    | "invalid_iv"
    | "invalid_iterations"
    | "key_derivation_failed"
    | "unaligned_ciphertext"
    | "ciphertext_too_short"
    | "unsupported_key_size"
    | "authentication_failed"
    | "decryption_failed"
    | "undecodable_text";

export type AesFailure = {
    readonly ok: false;
    readonly reason: AesFailureReason;
    /** Bytes actually supplied, set by the complaints about a fixed width. */
    readonly actualBytes?: number;
    /** Bytes the operation required, set by the same. */
    readonly expectedBytes?: number;
};

export type AesSuccess = {
    readonly ok: true;
    /** The result rendered in the chosen encoding — what the output box shows. */
    readonly output: string;
    /**
     * The same result as bytes. Carried because a decrypted file is bytes and
     * not text: rendering it as base64 and asking a reader to decode that
     * somewhere else would be a round trip the tool refuses to finish itself.
     */
    readonly bytes: CipherBytes;
    readonly inputBytes: number;
    readonly outputBytes: number;
};

export type AesResult = AesSuccess | AesFailure;

/**
 * Bytes on their way to Web Crypto.
 *
 * `BufferSource` refuses a `Uint8Array` that might be backed by a
 * `SharedArrayBuffer`. Nothing here ever is, so the buffer type is named once
 * rather than asserted at every call site.
 */
export type CipherBytes = Uint8Array<ArrayBuffer>;

export type AesKeyResult = { readonly ok: true; readonly bytes: CipherBytes } | AesFailure;

/** Everything the key depends on, and nothing else — this is what a cache keys on. */
export type AesKeyInput = {
    readonly source: AesKeySource;
    readonly secret: string;
    /** Hex. Read only under `passphrase`. */
    readonly saltHex: string;
    /** PBKDF2 iterations. Read only under `passphrase`. */
    readonly iterations: number;
    readonly keySize: AesKeySize;
};

/**
 * Everything the two directions can be told to do, beyond the payload and the
 * key. Options that do not apply to the current mode or key source are still
 * carried, so switching away and back does not lose what was set.
 */
export type AesOptions = {
    readonly mode: AesMode;
    readonly keySize: AesKeySize;
    readonly keySource: AesKeySource;
    /** Hex, `AES_SALT_BYTES` wide. Ignored unless the key is a passphrase. */
    readonly saltHex: string;
    /** Hex, as wide as the mode requires — 16 bytes, or 12 under GCM. */
    readonly ivHex: string;
    /** Authentication tag width in bits. Read only under GCM. */
    readonly tagLength: GcmTagLength;
    readonly iterations: number;
    /** Applies to the plaintext side, whichever box that is in this direction. */
    readonly textEncoding: AesTextEncoding;
    /** Applies to the ciphertext side, likewise. */
    readonly cipherEncoding: AesCipherEncoding;
};

/**
 * What the input box currently holds: typed text, or an opened file.
 *
 * The two are not symmetric, and deliberately so. Encrypting a file takes its
 * bytes as the plaintext, so the plaintext encoding has nothing to act on.
 * Decrypting a file reads it as text, because a ciphertext this tool wrote is
 * hex or base64 in a `.txt` — which is what makes the round trip close.
 */
export type AesSource =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "file"; readonly name: string; readonly bytes: CipherBytes };

export type AesRequest = {
    readonly direction: AesDirection;
    readonly source: AesSource;
    readonly secret: string;
    readonly options: AesOptions;
};

export type AesExportRequest = {
    readonly direction: AesDirection;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};

export type AesBlobExportRequest = {
    readonly direction: AesDirection;
    readonly bytes: CipherBytes;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
