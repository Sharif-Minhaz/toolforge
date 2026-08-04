import type { ConversionOptions, DataFormat } from "../types";

/**
 * Which controls the current pairing actually reads.
 *
 * One predicate per option, shared by the panel that disables the control and
 * by anything else that has to know — so "does this setting apply" has one
 * answer rather than two that drift. Nudging the TOON delimiter while the
 * target is BSON must not look like it did something.
 */

export function bsonEncodingApplies(source: DataFormat, target: DataFormat): boolean {
    return source === "bson" || target === "bson";
}

/**
 * Only the *reader* chooses. Writing BSON parses Extended JSON faithfully in
 * both shapes — relaxed and canonical spellings of the same value produce the
 * same bytes — so offering the choice on that side would be a control with
 * nothing behind it.
 */
export function ejsonModeApplies(source: DataFormat): boolean {
    return source === "bson";
}

export function jsonIndentApplies(target: DataFormat): boolean {
    return target === "json";
}

export function toonDelimiterApplies(target: DataFormat): boolean {
    return target === "toon";
}

/** Both directions: the decoder measures indentation, the encoder writes it. */
export function toonIndentApplies(source: DataFormat, target: DataFormat): boolean {
    return source === "toon" || target === "toon";
}

export function toonStrictApplies(source: DataFormat): boolean {
    return source === "toon";
}

/**
 * The options the given pairing can be affected by, with every other field
 * pinned to its incoming value. Used to key a memo or a link without letting a
 * setting nothing reads change the answer.
 */
export function readableOptions(
    source: DataFormat,
    target: DataFormat,
    options: ConversionOptions,
): readonly string[] {
    const parts: string[] = [];

    if (bsonEncodingApplies(source, target)) {
        parts.push(`bsonEncoding=${options.bsonEncoding}`);
    }

    if (ejsonModeApplies(source)) {
        parts.push(`ejsonMode=${options.ejsonMode}`);
    }

    if (jsonIndentApplies(target)) {
        parts.push(`jsonIndent=${options.jsonIndent}`);
    }

    if (toonDelimiterApplies(target)) {
        parts.push(`toonDelimiter=${options.toonDelimiter}`);
    }

    if (toonIndentApplies(source, target)) {
        parts.push(`toonIndent=${options.toonIndent}`);
    }

    if (toonStrictApplies(source)) {
        parts.push(`toonStrict=${options.toonStrict}`);
    }

    return parts;
}
