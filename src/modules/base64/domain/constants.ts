import type {
    Base64Alphabet,
    Base64ConversionOptions,
    Base64EncodeOptions,
    Base64Mode,
    NewlineSeparator,
} from "../types";
import type { CharsetId } from "./charsets";

export const STANDARD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** RFC 4648 §5: `+` and `/` swapped for `-` and `_` so the text survives a URL. */
export const URL_SAFE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const ALPHABETS: Record<Base64Alphabet, string> = {
    standard: STANDARD_ALPHABET,
    urlSafe: URL_SAFE_ALPHABET,
};

export const DEFAULT_BASE64_MODE: Base64Mode = "encode";

export const DEFAULT_ENCODE_OPTIONS: Base64EncodeOptions = {
    alphabet: "standard",
    padded: true,
};

export const DEFAULT_CHARSET: CharsetId = "utf-8";

export const DEFAULT_NEWLINE: NewlineSeparator = "lf";

export const DEFAULT_CONVERSION_OPTIONS: Base64ConversionOptions = {
    ...DEFAULT_ENCODE_OPTIONS,
    dataUri: false,
    charset: DEFAULT_CHARSET,
    newline: DEFAULT_NEWLINE,
    perLine: false,
    wrapLines: false,
};

/**
 * Ceiling on a single conversion. Everything runs on the main thread, and a
 * megabyte already encodes in a few milliseconds on a modest phone.
 */
export const MAX_BASE64_INPUT_BYTES = 1_048_576;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

export const DEFAULT_DATA_URI_MIME_TYPE = "application/octet-stream";

/** Media type used when typed text is wrapped in a data URI. */
export const TEXT_MIME_TYPE = "text/plain;charset=utf-8";

/** `data:image/png;base64,` — the header a data URI carries before its payload. */
export const DATA_URI_PATTERN = /^data:([^;,]*)(;[^,]*)?;base64,/i;
