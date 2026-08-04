import type { HighlightLanguage } from "@/modules/tools/domain/highlight";
import type { BsonEncoding, ConversionOptions, DataFormat } from "../types";

/**
 * Characters, counted on the input box. Every conversion is a full parse and a
 * full write, both held in memory at once, and this runs on the reader's own
 * machine — a megabyte of hex is about the point where a phone stops enjoying
 * it. A BSON document is capped by the format itself at 16 MB, so this bites
 * first for hex (two characters a byte) and never for a realistic document.
 */
export const MAX_INPUT_LENGTH = 1_000_000;

/**
 * The largest file worth opening, derived from the ceiling rather than picked
 * separately — a file that reads in and then fails the length check is a worse
 * answer than one that was never accepted. Hex spends two characters a byte,
 * base64 four for every three.
 */
export function maxFileBytes(encoding: BsonEncoding): number {
    return encoding === "hex"
        ? Math.floor(MAX_INPUT_LENGTH / 2)
        : Math.floor((MAX_INPUT_LENGTH * 3) / 4);
}

export const DEFAULT_SOURCE_FORMAT: DataFormat = "json";

export const DEFAULT_TARGET_FORMAT: DataFormat = "toon";

export const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
    bsonEncoding: "hex",
    // Canonical by default because it is the only mode that returns the same
    // bytes it was given. A reader who wants readable output can ask for it;
    // a reader who did not know they were losing types cannot ask for them back.
    ejsonMode: "canonical",
    jsonIndent: "two",
    toonDelimiter: "comma",
    toonIndent: "two",
    toonStrict: true,
};

/**
 * What the empty input box shows, one per source notation.
 *
 * Data rather than copy, so it lives here and not in the message catalogue —
 * for two separate reasons, and the second one is the sharp edge. A translator
 * has nothing to do with `{ "name": "Ada" }` and could only break it; that is
 * the usual rule about proper names. But next-intl parses *every* message as
 * ICU MessageFormat, where a literal `{` opens an argument — so as a message,
 * the JSON sample does not merely risk translation, it fails to parse at all
 * and renders as its own key. `tools/tests/messages.test.ts` now catches that
 * class of mistake for the whole catalogue.
 */
export const INPUT_PLACEHOLDERS = {
    bson: "3c000000075f696400…",
    json: '{ "name": "Ada", "score": 4.5 }',
    toon: "name: Ada",
} as const satisfies Record<DataFormat, string>;

/**
 * Which tokenizer paints a given side of the conversion.
 *
 * BSON is the only one that depends on more than the format: hex has the two
 * landmarks worth marking — the declared length it opens with and the
 * terminator it closes with — and base64 has no structure at all, so it says so
 * rather than having something invented for it.
 */
export function highlightLanguageFor(
    format: DataFormat,
    encoding: BsonEncoding,
): HighlightLanguage {
    if (format === "bson") {
        return encoding === "hex" ? "hex" : "plain";
    }

    return format;
}

/** Spaces per level, or `null` for the one-line form. */
export const JSON_INDENT_WIDTHS = {
    minified: null,
    two: 2,
    four: 4,
    tab: "\t",
} as const satisfies Record<string, number | string | null>;

export const TOON_DELIMITER_CHARACTERS = {
    comma: ",",
    tab: "\t",
    pipe: "|",
} as const satisfies Record<string, string>;

export const TOON_INDENT_WIDTHS = {
    two: 2,
    four: 4,
} as const satisfies Record<string, number>;

/**
 * Uniform rows of objects, which is the shape TOON's tabular form exists for —
 * so pressing "example" on the default JSON → TOON pairing shows the tool doing
 * the thing it is for, not a nested config that TOON encodes no better than
 * JSON does.
 */
export const SAMPLE_JSON = `{
  "orders": [
    { "id": 1041, "customer": "Ada", "total": 129.5, "status": "shipped" },
    { "id": 1042, "customer": "Grace", "total": 84, "status": "packing" },
    { "id": 1043, "customer": "Alan", "total": 219.99, "status": "shipped" }
  ],
  "generatedAt": "2026-08-04T09:15:00Z"
}`;

export const SAMPLE_TOON = `orders[3]{id,customer,total,status}:
  1041,Ada,129.5,shipped
  1042,Grace,84,packing
  1043,Alan,219.99,shipped
generatedAt: "2026-08-04T09:15:00Z"`;

/**
 * One document carrying an ObjectId, a string, a double and a boolean, exactly
 * as MongoDB would store it — so the sample shows what canonical Extended JSON
 * is for rather than looking like reformatted JSON.
 *
 * Written by the encoder, not by hand, and decoded again in a test. A wrong
 * nibble in a literal like this teaches the reader the tool is broken.
 */
export const SAMPLE_BSON_HEX =
    "3c000000075f69640064b7c0f0e1a2b3c4d5e6f708026e616d65000400" +
    "0000416461000173636f726500000000000000124008616374697665000100";
