import type { CharsetId } from "@/modules/tools/domain/charsets";
import type { NewlineSeparator, TextCodecFailureReason } from "@/modules/tools/types";

export const URL_MODES = ["encode", "decode"] as const;

export type UrlMode = (typeof URL_MODES)[number];

/**
 * How much of the input survives an encode untouched:
 *
 * - `component` keeps only RFC 3986 §2.3 unreserved characters, so the result
 *   is safe anywhere inside a URL — a path segment, a query value, a fragment.
 * - `uri` additionally keeps the reserved characters that give a URL its shape,
 *   for encoding a whole address without dismantling it.
 * - `form` is the WHATWG `application/x-www-form-urlencoded` serialiser: space
 *   becomes `+`, and only `*-._` join the alphanumerics.
 */
export const URL_ENCODE_PROFILES = ["component", "uri", "form"] as const;

export type UrlEncodeProfile = (typeof URL_ENCODE_PROFILES)[number];

/**
 * The shared text codec's three reasons, widened with the two ways a percent
 * escape itself can be malformed and the size ceiling.
 */
export type UrlFailureReason =
    TextCodecFailureReason | "invalid_escape" | "truncated_escape" | "too_large";

export type UrlFailure = {
    readonly ok: false;
    readonly reason: UrlFailureReason;
    /** 1-based index of the offending character, when one can be pinpointed. */
    readonly position?: number;
    /** 1-based line, set only while converting each line separately. */
    readonly line?: number;
};

export type UrlDecodeBytesResult = { readonly ok: true; readonly bytes: Uint8Array } | UrlFailure;

/** A decoded payload, plus how many times it had to be unwrapped. */
export type UrlDecodeRoundResult =
    { readonly ok: true; readonly text: string; readonly passes: number } | UrlFailure;

/** What the workbench is currently converting: typed text, or an opened file. */
export type UrlSource =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "file"; readonly name: string; readonly bytes: Uint8Array };

/** Everything the two directions can be told to do, beyond the input itself. */
export type UrlConversionOptions = {
    /** Which characters escape encoding. Ignored when decoding. */
    readonly profile: UrlEncodeProfile;
    /** `%2F` rather than `%2f`, as RFC 3986 §2.1 recommends. */
    readonly uppercaseHex: boolean;
    /** Source set when encoding, destination set when decoding. */
    readonly charset: CharsetId;
    readonly newline: NewlineSeparator;
    /** Converts each input line on its own instead of as one payload. */
    readonly perLine: boolean;
    /** Breaks encoded output into 76-character lines, never mid-escape. */
    readonly wrapLines: boolean;
    /** Reads `+` as a space, the way form data is written. Decode only. */
    readonly plusAsSpace: boolean;
    /** Keeps decoding while the text still unwraps. Decode only. */
    readonly recursive: boolean;
};

export type UrlExportRequest = {
    readonly mode: UrlMode;
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
