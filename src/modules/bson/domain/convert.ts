import { bytesToBsonText, readBson, readBsonText, writeBson } from "./bson-codec";
import { MAX_INPUT_LENGTH, TOON_DELIMITER_CHARACTERS } from "./constants";
import { readJson, writeJson } from "./json-codec";
import { containsDelimiter, readToon, writeToon } from "./toon-codec";
import type {
    ConversionFailure,
    ConversionNote,
    ConversionOptions,
    ConversionRequest,
    ConversionResult,
    DataFormat,
    JsonValue,
} from "../types";

type ReadResult =
    | {
          readonly ok: true;
          readonly value: JsonValue;
          /** Relaxed Extended JSON did not survive the trip back to bytes. */
          readonly lossy: boolean;
      }
    | ConversionFailure;

type WriteResult =
    | {
          readonly ok: true;
          readonly output: string;
          /** Only BSON has bytes worth handing to a download. */
          readonly bytes: Uint8Array | null;
      }
    | ConversionFailure;

function read(format: DataFormat, input: string, options: ConversionOptions): ReadResult {
    switch (format) {
        case "bson": {
            const bytes = readBsonText(input, options.bsonEncoding);

            if (bytes === null) {
                return {
                    ok: false,
                    reason: options.bsonEncoding === "hex" ? "invalid_hex" : "invalid_base64",
                };
            }

            return readBson(bytes, options.ejsonMode);
        }
        case "json": {
            const parsed = readJson(input);

            return parsed.ok ? { ...parsed, lossy: false } : parsed;
        }
        case "toon": {
            const parsed = readToon(input, options);

            return parsed.ok ? { ...parsed, lossy: false } : parsed;
        }
    }
}

function write(format: DataFormat, value: JsonValue, options: ConversionOptions): WriteResult {
    switch (format) {
        case "bson": {
            const written = writeBson(value);

            if (!written.ok) {
                return written;
            }

            return {
                ok: true,
                output: bytesToBsonText(written.bytes, options.bsonEncoding),
                bytes: written.bytes,
            };
        }
        case "json":
            return { ok: true, output: writeJson(value, options.jsonIndent), bytes: null };
        case "toon":
            return { ok: true, output: writeToon(value, options), bytes: null };
    }
}

/**
 * What the conversion changed, could not carry, or is about to cost.
 *
 * Every entry has to be *earned* by this document and this pairing. A note that
 * fires on every conversion is a banner, and a banner is something readers stop
 * seeing — which is exactly when the one that matters arrives.
 */
function collectNotes(
    request: ConversionRequest,
    value: JsonValue,
    lossy: boolean,
): readonly ConversionNote[] {
    const { source, target, options } = request;
    const notes: ConversionNote[] = [];

    if (source === "bson" && target !== "bson") {
        notes.push({ id: "extendedJson", kind: "info" });
    }

    if (lossy) {
        notes.push({ id: "relaxedLossy", kind: "lossy" });
    }

    if (source === "bson" && target === "toon" && options.ejsonMode === "canonical") {
        notes.push({ id: "canonicalVerbose", kind: "info" });
    }

    if (target === "bson" && source !== "bson") {
        notes.push({ id: "numbersRetyped", kind: "adapted" });
    }

    // Comma is the default and appears inside ordinary prose, so quoting under
    // it is routine and saying so every time would be noise. A tab or a pipe
    // was picked *to avoid* quoting, which makes finding one inside a value
    // worth a line.
    if (target === "toon" && options.toonDelimiter !== "comma") {
        const delimiter = TOON_DELIMITER_CHARACTERS[options.toonDelimiter];

        if (containsDelimiter(value, delimiter)) {
            notes.push({ id: "delimiterInValues", kind: "adapted" });
        }
    }

    return notes;
}

/**
 * The one conversion the whole tool runs, shared by the server-rendered first
 * paint and every settled keystroke afterwards.
 *
 * Both halves are a parse into the JSON data model and a write back out of it,
 * never a rewrite of one notation into another. That is what stops BSON → TOON
 * from developing its own opinion about what `$numberLong` means, and it is why
 * adding a fourth format would cost one reader and one writer rather than six
 * new conversions.
 */
export function convert(request: ConversionRequest): ConversionResult {
    const { source, target, input, options } = request;

    if (input.trim().length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (input.length > MAX_INPUT_LENGTH) {
        return { ok: false, reason: "too_large" };
    }

    const parsed = read(source, input, options);

    if (!parsed.ok) {
        return parsed;
    }

    const written = write(target, parsed.value, options);

    if (!written.ok) {
        return written;
    }

    return {
        ok: true,
        output: written.output,
        notes: collectNotes(request, parsed.value, parsed.lossy),
        inputLength: input.length,
        outputLength: written.output.length,
        bytes: written.bytes,
    };
}
