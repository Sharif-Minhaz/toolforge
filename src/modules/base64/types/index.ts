import type { CharsetId } from "../domain/charsets";

export const BASE64_MODES = ["encode", "decode"] as const;

export type Base64Mode = (typeof BASE64_MODES)[number];

export const BASE64_ALPHABETS = ["standard", "urlSafe"] as const;

export type Base64Alphabet = (typeof BASE64_ALPHABETS)[number];

export const NEWLINE_SEPARATORS = ["lf", "crlf", "cr"] as const;

export type NewlineSeparator = (typeof NEWLINE_SEPARATORS)[number];

export type Base64EncodeOptions = {
    readonly alphabet: Base64Alphabet;
    /** Whether the output is padded to a multiple of four with `=`. */
    readonly padded: boolean;
};

/**
 * Failure channel shared by both directions: text can be unwritable in the
 * chosen character set, and base64 can be malformed or not decode to text.
 */
export type Base64FailureReason =
    | "invalid_character"
    | "invalid_length"
    | "undecodable_text"
    | "unencodable_character"
    | "unsupported_charset"
    | "too_large";

export type Base64Failure = {
    readonly ok: false;
    readonly reason: Base64FailureReason;
    /** 1-based index of the offending character, when one can be pinpointed. */
    readonly position?: number;
    /** 1-based line, set only while converting each line separately. */
    readonly line?: number;
};

export type Base64DecodeBytesResult =
    { readonly ok: true; readonly bytes: Uint8Array } | Base64Failure;

export type Base64DecodeTextResult = { readonly ok: true; readonly text: string } | Base64Failure;

export type Base64EncodeBytesResult =
    { readonly ok: true; readonly bytes: Uint8Array } | Base64Failure;

/** What the workbench is currently converting: typed text, or an opened file. */
export type Base64Source =
    | { readonly kind: "text"; readonly text: string }
    | {
          readonly kind: "file";
          readonly name: string;
          readonly mimeType: string;
          readonly bytes: Uint8Array;
      };

/** Everything the two directions can be told to do, beyond the input itself. */
export type Base64ConversionOptions = {
    readonly alphabet: Base64Alphabet;
    readonly padded: boolean;
    /** Prefixes encoded output with a `data:` header. Ignored when decoding. */
    readonly dataUri: boolean;
    /** Source set when encoding, destination set when decoding. */
    readonly charset: CharsetId;
    readonly newline: NewlineSeparator;
    /** Converts each input line on its own instead of as one payload. */
    readonly perLine: boolean;
    /** Wraps encoded output at 76 characters, as MIME requires. */
    readonly wrapLines: boolean;
};

export type Base64ExportRequest = {
    readonly mode: Base64Mode;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
