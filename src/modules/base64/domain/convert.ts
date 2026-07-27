import { getByteLength } from "@/modules/tools/domain/byte-size";
import type {
    Base64ConversionOptions,
    Base64DecodeTextResult,
    Base64Failure,
    Base64Mode,
    Base64Source,
} from "../types";
import { getCharset } from "@/modules/tools/domain/charsets";
import { buildDataUri, decodeToBytes, encodeBytes, exceedsInputLimit } from "./codec";
import { TEXT_MIME_TYPE } from "./constants";
import { applyNewlines, joinLines, splitLines, wrapLines } from "@/modules/tools/domain/lines";
import { bytesToText, textToBytes } from "@/modules/tools/domain/text-codec";

export type Base64ConversionRequest = {
    readonly mode: Base64Mode;
    readonly source: Base64Source;
    readonly options: Base64ConversionOptions;
};

export type Base64ConversionSuccess = {
    readonly ok: true;
    readonly output: string;
    readonly inputBytes: number;
    readonly outputBytes: number;
};

export type Base64ConversionResult = Base64ConversionSuccess | Base64Failure;

/** Adds the line number to a failure raised while converting line by line. */
function onLine(failure: Base64Failure, line: number): Base64Failure {
    return { ...failure, line };
}

function readSourceText(source: Base64Source): string {
    // A file opened in decode mode holds base64 text, so a lossy read is
    // enough — any byte the decoder cannot use is reported as invalid anyway.
    return source.kind === "file" ? new TextDecoder().decode(source.bytes) : source.text;
}

function sourceMimeType(source: Base64Source): string {
    return source.kind === "file" ? source.mimeType : TEXT_MIME_TYPE;
}

/**
 * A `data:` header only describes one continuous, standard-alphabet payload —
 * wrapping it or emitting one payload per line would produce something no
 * browser can load.
 */
export function supportsDataUri(options: Base64ConversionOptions): boolean {
    return options.alphabet === "standard" && !options.wrapLines && !options.perLine;
}

/* ---------------------------------------------------------------- encode --- */

function encodeOne(bytes: Uint8Array, options: Base64ConversionOptions): string {
    const encoded = encodeBytes(bytes, { alphabet: options.alphabet, padded: options.padded });

    return options.wrapLines ? wrapLines(encoded, options.newline) : encoded;
}

function encode(source: Base64Source, options: Base64ConversionOptions): Base64ConversionResult {
    // A file is already bytes, so neither the character set nor the line
    // options have anything to act on.
    if (source.kind === "file") {
        if (exceedsInputLimit(source.bytes.length)) {
            return { ok: false, reason: "too_large" };
        }

        const encoded = encodeOne(source.bytes, options);
        const output =
            options.dataUri && supportsDataUri(options)
                ? buildDataUri(encoded, sourceMimeType(source))
                : encoded;

        return {
            ok: true,
            output,
            inputBytes: source.bytes.length,
            outputBytes: output.length,
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

        return { ok: true, output, inputBytes, outputBytes: output.length };
    }

    const normalized = applyNewlines(source.text, options.newline);
    const encoded = textToBytes(normalized, options.charset);

    if (!encoded.ok) {
        return encoded;
    }

    if (exceedsInputLimit(encoded.bytes.length)) {
        return { ok: false, reason: "too_large" };
    }

    const body = encodeOne(encoded.bytes, options);
    const output =
        options.dataUri && supportsDataUri(options)
            ? buildDataUri(body, sourceMimeType(source))
            : body;

    return { ok: true, output, inputBytes: encoded.bytes.length, outputBytes: output.length };
}

/* ---------------------------------------------------------------- decode --- */

function decodeOne(payload: string, options: Base64ConversionOptions): Base64DecodeTextResult {
    const decoded = decodeToBytes(payload);

    return decoded.ok ? bytesToText(decoded.bytes, options.charset) : decoded;
}

function decode(source: Base64Source, options: Base64ConversionOptions): Base64ConversionResult {
    const input = readSourceText(source);
    const inputBytes = getByteLength(input);

    if (exceedsInputLimit(inputBytes)) {
        return { ok: false, reason: "too_large" };
    }

    if (options.perLine) {
        const lines: string[] = [];

        for (const [index, line] of splitLines(input).entries()) {
            // A blank line has nothing to decode but still holds its place.
            if (line.trim().length === 0) {
                lines.push("");
                continue;
            }

            const decoded = decodeOne(line, options);

            if (!decoded.ok) {
                return onLine(decoded, index + 1);
            }

            lines.push(decoded.text);
        }

        const output = joinLines(lines, options.newline);

        return { ok: true, output, inputBytes, outputBytes: getByteLength(output) };
    }

    const decoded = decodeOne(input, options);

    if (!decoded.ok) {
        return decoded;
    }

    const output = applyNewlines(decoded.text, options.newline);

    return { ok: true, output, inputBytes, outputBytes: getByteLength(output) };
}

/**
 * The one conversion the whole tool runs, shared by the server-rendered first
 * paint and every settled keystroke afterwards.
 */
export function convert(request: Base64ConversionRequest): Base64ConversionResult {
    const { mode, source, options } = request;
    const charset = getCharset(options.charset);

    // The encode list never offers a decode-only set, so this only catches a
    // stale link carrying one.
    if (mode === "encode" && charset.encoder === null) {
        return { ok: false, reason: "unencodable_character" };
    }

    return mode === "encode" ? encode(source, options) : decode(source, options);
}
