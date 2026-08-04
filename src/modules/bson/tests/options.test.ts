import { describe, expect, test } from "bun:test";

import { DEFAULT_CONVERSION_OPTIONS } from "@/modules/bson/domain/constants";
import {
    bsonEncodingApplies,
    ejsonModeApplies,
    jsonIndentApplies,
    readableOptions,
    toonDelimiterApplies,
    toonIndentApplies,
    toonStrictApplies,
} from "@/modules/bson/domain/options";

describe("which controls a pairing reads", () => {
    test("BSON's notation applies on either side of the conversion", () => {
        expect(bsonEncodingApplies("bson", "json")).toBe(true);
        expect(bsonEncodingApplies("toon", "bson")).toBe(true);
        expect(bsonEncodingApplies("json", "toon")).toBe(false);
    });

    test("the Extended JSON mode is the reader's choice alone", () => {
        expect(ejsonModeApplies("bson")).toBe(true);
        expect(ejsonModeApplies("json")).toBe(false);
        expect(ejsonModeApplies("toon")).toBe(false);
    });

    test("each notation's formatting applies only where it is written", () => {
        expect(jsonIndentApplies("json")).toBe(true);
        expect(jsonIndentApplies("toon")).toBe(false);
        expect(toonDelimiterApplies("toon")).toBe(true);
        expect(toonDelimiterApplies("bson")).toBe(false);
    });

    test("TOON's indent is read as well as written", () => {
        expect(toonIndentApplies("toon", "json")).toBe(true);
        expect(toonIndentApplies("json", "toon")).toBe(true);
        expect(toonIndentApplies("bson", "json")).toBe(false);
    });

    test("strict length checking is a reader's setting", () => {
        expect(toonStrictApplies("toon")).toBe(true);
        expect(toonStrictApplies("json")).toBe(false);
    });
});

describe("readableOptions", () => {
    test("lists only what the pairing can be affected by", () => {
        expect(readableOptions("json", "toon", DEFAULT_CONVERSION_OPTIONS)).toEqual([
            "toonDelimiter=comma",
            "toonIndent=two",
        ]);
    });

    test("changing a setting nothing reads leaves the list identical", () => {
        const nudged = { ...DEFAULT_CONVERSION_OPTIONS, jsonIndent: "four" } as const;

        expect(readableOptions("json", "toon", nudged)).toEqual(
            readableOptions("json", "toon", DEFAULT_CONVERSION_OPTIONS),
        );
    });

    test("covers every control when BSON is read into TOON", () => {
        expect(readableOptions("bson", "toon", DEFAULT_CONVERSION_OPTIONS)).toEqual([
            "bsonEncoding=hex",
            "ejsonMode=canonical",
            "toonDelimiter=comma",
            "toonIndent=two",
        ]);
    });
});
