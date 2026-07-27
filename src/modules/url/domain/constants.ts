import type { CharsetId } from "@/modules/tools/domain/charsets";
import type { NewlineSeparator } from "@/modules/tools/types";
import type { UrlConversionOptions, UrlEncodeProfile, UrlMode } from "../types";

export const DEFAULT_URL_MODE: UrlMode = "encode";

/** The safest default: a value encoded this way survives anywhere in a URL. */
export const DEFAULT_URL_PROFILE: UrlEncodeProfile = "component";

export const DEFAULT_URL_CHARSET: CharsetId = "utf-8";

export const DEFAULT_URL_NEWLINE: NewlineSeparator = "lf";

export const DEFAULT_URL_OPTIONS: UrlConversionOptions = {
    profile: DEFAULT_URL_PROFILE,
    uppercaseHex: true,
    charset: DEFAULT_URL_CHARSET,
    newline: DEFAULT_URL_NEWLINE,
    perLine: false,
    wrapLines: false,
    // Off by default: plain percent-decoding leaves `+` alone, and turning a
    // path's `+` into a space would corrupt it.
    plusAsSpace: false,
    recursive: false,
};

/**
 * Ceiling on a single conversion. Everything runs on the main thread, and a
 * megabyte already converts in a few milliseconds on a modest phone.
 */
export const MAX_URL_INPUT_BYTES = 1_048_576;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/**
 * How many times repeated decoding will unwrap a payload. Doubly-encoded links
 * are common, sixteen-times-encoded ones are a loop, not a document.
 */
export const MAX_DECODE_PASSES = 16;

/** Width used when encoded output is split into lines, matching MIME's 76. */
export const URL_LINE_WIDTH = 76;
