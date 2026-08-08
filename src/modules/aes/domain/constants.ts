import type {
    AesCipherEncoding,
    AesDirection,
    AesKeySize,
    AesKeySource,
    AesMode,
    AesOptions,
    AesTextEncoding,
    GcmTagLength,
} from "../types";

export const DEFAULT_AES_DIRECTION: AesDirection = "encrypt";

/**
 * GCM is the default because it is the only mode here that can tell you the
 * ciphertext was altered. CBC and CTR decrypt tampered input happily and hand
 * back plausible-looking rubbish.
 */
export const DEFAULT_AES_MODE: AesMode = "gcm";

export const DEFAULT_AES_KEY_SIZE: AesKeySize = 256;

export const DEFAULT_AES_KEY_SOURCE: AesKeySource = "passphrase";

export const DEFAULT_TEXT_ENCODING: AesTextEncoding = "utf-8";

export const DEFAULT_CIPHER_ENCODING: AesCipherEncoding = "base64";

/** What the generator draws, which is what every PBKDF2 recommendation asks for. */
export const AES_SALT_BYTES = 16;

/**
 * A pasted salt is only bounded, not fixed: PBKDF2 takes a salt of any length,
 * and someone reproducing another system's parameters may well arrive with an
 * eight-byte one. Refusing it would make this tool unable to check their work.
 */
export const MIN_SALT_BYTES = 1;

export const MAX_SALT_BYTES = 64;

/**
 * The tag width to land on. The full one: a shorter tag is fewer bits of
 * forgery resistance and nothing else, so it is a choice to make deliberately
 * rather than a default to inherit.
 */
export const DEFAULT_GCM_TAG_LENGTH: GcmTagLength = 128;

/**
 * How many bits of the CTR counter block increment. Sixty-four is the usual
 * choice and is what the NIST SP 800-38A vectors assume for messages this
 * short; the value matters to anyone reproducing the output elsewhere, which is
 * why it is a named constant and is documented in the article.
 */
export const CTR_COUNTER_BITS = 64;

/**
 * What GCM's nonce is allowed to be here.
 *
 * Twelve bytes is what `ivBytesFor` draws and what NIST SP 800-38D recommends,
 * because a 96-bit nonce is used directly while any other width is first run
 * through GHASH — a different construction producing a different keystream.
 * Both are legal GCM, which is exactly the problem: a tool that fixed the width
 * at twelve could not read what a system using sixteen had written.
 *
 * The bounds are a static rule rather than a probe. Runtimes disagree about the
 * short end — Node refuses anything under twelve, Bun accepts a single byte —
 * so the range stays the same everywhere and an engine that will not take a
 * width says so through `unsupported_iv_length`.
 */
export const MIN_GCM_NONCE_BYTES = 1;

export const MAX_GCM_NONCE_BYTES = 64;

/**
 * The two widths that actually exist in the wild, offered as a picker so a
 * reader can draw one rather than hand-type thirty-two hex characters.
 *
 * Twelve is the recommendation. Sixteen is what a great many libraries default
 * to — Java's `GCMParameterSpec` among them — and several tools refuse anything
 * else outright. Any other width can still be pasted; the picker grows to show
 * it rather than pretending it is not there.
 */
export const GCM_NONCE_WIDTH_PRESETS = [12, 16] as const;

export const PBKDF2_HASH = "SHA-256";

export const MIN_PBKDF2_ITERATIONS = 1_000;

/**
 * Two million is roughly three times the current recommendation and about as
 * far as a browser tab can be pushed before the derivation reads as a hang. The
 * ceiling is a UI constraint, not a cryptographic one.
 */
export const MAX_PBKDF2_ITERATIONS = 2_000_000;

/** OWASP's current figure for PBKDF2-HMAC-SHA256. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

export const PBKDF2_ITERATION_PRESETS = [100_000, 310_000, 600_000] as const;

export const PBKDF2_ITERATION_STEP = 10_000;

/** Past this a single derivation blocks the tab for about a second. */
export const SLOW_PBKDF2_ITERATIONS = 1_000_000;

/**
 * Ceiling on the payload. AES itself would stream through far more, but both
 * boxes are re-read on every settled keystroke and the result is re-rendered
 * whole, so this is about keeping the main thread responsive.
 */
export const MAX_AES_INPUT_LENGTH = 131_072;

/**
 * The same ceiling for an opened file, measured in bytes because that is what a
 * file has. Encrypting is not the expensive part — rendering 128 KiB of
 * ciphertext as one base64 string already is.
 */
export const MAX_AES_INPUT_BYTES = 131_072;

/**
 * Ceiling on the passphrase or key box. Deliberately generous: this is refused
 * rather than truncated, because silently dropping the tail of a secret would
 * derive a different key without saying so.
 */
export const MAX_AES_SECRET_LENGTH = 1_024;

export const DEFAULT_AES_OPTIONS: Omit<AesOptions, "saltHex" | "ivHex"> = {
    mode: DEFAULT_AES_MODE,
    keySize: DEFAULT_AES_KEY_SIZE,
    keySource: DEFAULT_AES_KEY_SOURCE,
    tagLength: DEFAULT_GCM_TAG_LENGTH,
    iterations: DEFAULT_PBKDF2_ITERATIONS,
    textEncoding: DEFAULT_TEXT_ENCODING,
    cipherEncoding: DEFAULT_CIPHER_ENCODING,
};
