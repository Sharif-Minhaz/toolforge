import { getByteLength } from "@/modules/tools/domain/byte-size";
import { applyNewlines, joinLines, splitLines } from "@/modules/tools/domain/lines";
import { bytesToText, textToBytes } from "@/modules/tools/domain/text-codec";
import type {
    UrlConversionOptions,
    UrlDecodeRoundResult,
    UrlFailure,
    UrlMode,
    UrlSource,
} from "../types";
import { exceedsInputLimit, percentDecode, percentEncode, wrapPercentEncoded } from "./codec";
import { MAX_DECODE_PASSES } from "./constants";

export type UrlConversionRequest = {
    readonly mode: UrlMode;
    readonly source: UrlSource;
    readonly options: UrlConversionOptions;
};

export type UrlConversionSuccess = {
    readonly ok: true;
    readonly output: string;
    readonly inputBytes: number;
    readonly outputBytes: number;
    /** How many rounds of decoding the payload took; always 1 when encoding. */
    readonly passes: number;
};

export type UrlConversionResult = UrlConversionSuccess | UrlFailure;

/** Adds the line number to a failure raised while converting line by line. */
function onLine(failure: UrlFailure, line: number): UrlFailure {
    return { ...failure, line };
}

function readSourceText(source: UrlSource): string {
    // A file opened in decode mode holds percent-encoded text, so a lossy read
    // is enough — any byte the decoder cannot use is reported anyway.
    return source.kind === "file" ? new TextDecoder().decode(source.bytes) : source.text;
}

/* ---------------------------------------------------------------- encode --- */

function encodeOne(bytes: Uint8Array, options: UrlConversionOptions): string {
    const encoded = percentEncode(bytes, options.profile, options.uppercaseHex);

    return options.wrapLines ? wrapPercentEncoded(encoded, options.newline) : encoded;
}

function encode(source: UrlSource, options: UrlConversionOptions): UrlConversionResult {
    // A file is already bytes, so neither the character set nor the line
    // options have anything to act on.
    if (source.kind === "file") {
        if (exceedsInputLimit(source.bytes.length)) {
            return { ok: false, reason: "too_large" };
        }

        const output = encodeOne(source.bytes, options);

        return {
            ok: true,
            output,
            inputBytes: source.bytes.length,
            outputBytes: output.length,
            passes: 1,
        };
    }

    if (options.perLine) {
        const lines: string[] = [];
        let inputBytes = 0;

        for (const [index, line] of splitLines(source.text).entries()) {
            const encoded = textToBytes(line, options.charset);

            if (!encoded.ok) {
                return onLine(encoded, index + 1);
            }

            inputBytes += encoded.bytes.length;
            lines.push(encodeOne(encoded.bytes, options));
        }

        if (exceedsInputLimit(inputBytes)) {
            return { ok: false, reason: "too_large" };
        }

        const output = joinLines(lines, options.newline);

        return { ok: true, output, inputBytes, outputBytes: output.length, passes: 1 };
    }

    const normalized = applyNewlines(source.text, options.newline);
    const encoded = textToBytes(normalized, options.charset);

    if (!encoded.ok) {
        return encoded;
    }

    if (exceedsInputLimit(encoded.bytes.length)) {
        return { ok: false, reason: "too_large" };
    }

    const output = encodeOne(encoded.bytes, options);

    return {
        ok: true,
        output,
        inputBytes: encoded.bytes.length,
        outputBytes: output.length,
        passes: 1,
    };
}

/* ---------------------------------------------------------------- decode --- */

/**
 * One payload, unwrapped until it stops changing. A pass that fails after the
 * first one is not an error: it means the text was already fully decoded and
 * what remains is an ordinary `%` or a stray escape in the plain text.
 */
function decodeOne(payload: string, options: UrlConversionOptions): UrlDecodeRoundResult {
    const limit = options.recursive ? MAX_DECODE_PASSES : 1;
    let current = payload;
    let passes = 0;

    for (let round = 0; round < limit; round += 1) {
        const decoded = percentDecode(current, options.charset, options.plusAsSpace);

        if (!decoded.ok) {
            return round === 0 ? decoded : { ok: true, text: current, passes };
        }

        const text = bytesToText(decoded.bytes, options.charset);

        if (!text.ok) {
            return round === 0 ? text : { ok: true, text: current, passes };
        }

        if (text.text === current) {
            // Nothing moved, so there was nothing left to unwrap.
            return { ok: true, text: current, passes: Math.max(passes, 1) };
        }

        current = text.text;
        passes += 1;
    }

    return { ok: true, text: current, passes };
}

/**
 * Encoded output can be split across lines, and a real line break never appears
 * inside a percent-encoded payload — a newline in the source is `%0A`. So in
 * whole-payload mode the breaks are joined back up before decoding, which is
 * what makes encode → wrap → decode return the original text.
 */
function stripLineBreaks(text: string): string {
    return splitLines(text).join("");
}

function decode(source: UrlSource, options: UrlConversionOptions): UrlConversionResult {
    const input = readSourceText(source);
    const inputBytes = getByteLength(input);

    if (exceedsInputLimit(inputBytes)) {
        return { ok: false, reason: "too_large" };
    }

    if (options.perLine) {
        const lines: string[] = [];
        let passes = 1;

        for (const [index, line] of splitLines(input).entries()) {
            // A blank line has nothing to decode but still holds its place.
            if (line.length === 0) {
                lines.push("");
                continue;
            }

            const decoded = decodeOne(line, options);

            if (!decoded.ok) {
                return onLine(decoded, index + 1);
            }

            passes = Math.max(passes, decoded.passes);
            lines.push(decoded.text);
        }

        const output = joinLines(lines, options.newline);

        return { ok: true, output, inputBytes, outputBytes: getByteLength(output), passes };
    }

    const decoded = decodeOne(stripLineBreaks(input), options);

    if (!decoded.ok) {
        return decoded;
    }

    const output = applyNewlines(decoded.text, options.newline);

    return {
        ok: true,
        output,
        inputBytes,
        outputBytes: getByteLength(output),
        passes: decoded.passes,
    };
}

/**
 * The one conversion the whole tool runs, shared by the server-rendered first
 * paint and every settled keystroke afterwards.
 */
export function convert(request: UrlConversionRequest): UrlConversionResult {
    const { mode, source, options } = request;

    return mode === "encode" ? encode(source, options) : decode(source, options);
}
