import { describe, expect, test } from "bun:test";
import { Double, Long, ObjectId, serialize } from "bson";

import { bytesToBsonText } from "@/modules/bson/domain/bson-codec";
import {
    DEFAULT_CONVERSION_OPTIONS,
    MAX_INPUT_LENGTH,
    SAMPLE_BSON_HEX,
    SAMPLE_JSON,
    SAMPLE_TOON,
} from "@/modules/bson/domain/constants";
import { convert } from "@/modules/bson/domain/convert";
import type {
    ConversionNoteId,
    ConversionOptions,
    ConversionResult,
    DataFormat,
} from "@/modules/bson/types";

function run(
    source: DataFormat,
    target: DataFormat,
    input: string,
    options: Partial<ConversionOptions> = {},
): ConversionResult {
    return convert({
        source,
        target,
        input,
        options: { ...DEFAULT_CONVERSION_OPTIONS, ...options },
    });
}

function outputOf(result: ConversionResult): string {
    expect(result.ok).toBe(true);

    return result.ok ? result.output : "";
}

function noteIds(result: ConversionResult): readonly ConversionNoteId[] {
    return result.ok ? result.notes.map((note) => note.id) : [];
}

describe("JSON ↔ TOON", () => {
    test("collapses a uniform array of objects into the tabular form", () => {
        const output = outputOf(run("json", "toon", SAMPLE_JSON));

        expect(output).toContain("orders[3]{id,customer,total,status}:");
        expect(output).toContain("  1041,Ada,129.5,shipped");
    });

    test("reads that form back to the value it came from", () => {
        const toon = outputOf(run("json", "toon", SAMPLE_JSON));
        const json = outputOf(run("toon", "json", toon));

        expect(JSON.parse(json)).toEqual(JSON.parse(SAMPLE_JSON));
    });

    test("the shipped TOON sample is what the shipped JSON sample encodes to", () => {
        expect(outputOf(run("json", "toon", SAMPLE_JSON))).toBe(SAMPLE_TOON);
    });

    test("honours the delimiter and the indent width", () => {
        const piped = outputOf(run("json", "toon", SAMPLE_JSON, { toonDelimiter: "pipe" }));

        // `[3|]`, not `[3]`: TOON scopes the delimiter by repeating it inside
        // the length marker, so a reader never has to infer which one is in
        // use. It looks like a typo and is not.
        expect(piped).toContain("orders[3|]{id|customer|total|status}:");
        expect(piped).toContain("  1041|Ada|129.5|shipped");

        const wide = outputOf(run("json", "toon", SAMPLE_JSON, { toonIndent: "four" }));

        expect(wide).toContain("\n    1041,Ada,129.5,shipped");
    });

    test("minifies and indents JSON on request", () => {
        expect(outputOf(run("toon", "json", "a: 1\nb: 2", { jsonIndent: "minified" }))).toBe(
            '{"a":1,"b":2}',
        );
        expect(outputOf(run("toon", "json", "a: 1", { jsonIndent: "tab" }))).toBe('{\n\t"a": 1\n}');
        expect(outputOf(run("toon", "json", "a: 1", { jsonIndent: "four" }))).toBe(
            '{\n    "a": 1\n}',
        );
    });
});

describe("BSON → JSON and TOON", () => {
    test("writes canonical Extended JSON", () => {
        const output = outputOf(run("bson", "json", SAMPLE_BSON_HEX));

        expect(JSON.parse(output)).toEqual({
            _id: { $oid: "64b7c0f0e1a2b3c4d5e6f708" },
            name: "Ada",
            score: { $numberDouble: "4.5" },
            active: true,
        });
    });

    test("writes relaxed Extended JSON when asked", () => {
        const output = outputOf(run("bson", "json", SAMPLE_BSON_HEX, { ejsonMode: "relaxed" }));

        expect(JSON.parse(output)).toEqual({
            _id: { $oid: "64b7c0f0e1a2b3c4d5e6f708" },
            name: "Ada",
            score: 4.5,
            active: true,
        });
    });

    test("reads base64 when the notation says so", () => {
        const bytes = serialize({ name: "Ada" });

        expect(
            JSON.parse(
                outputOf(
                    run("bson", "json", bytesToBsonText(bytes, "base64"), {
                        bsonEncoding: "base64",
                    }),
                ),
            ),
        ).toEqual({ name: "Ada" });
    });

    test("carries every type through TOON and back to identical bytes", () => {
        const bytes = serialize({
            _id: new ObjectId("64b7c0f0e1a2b3c4d5e6f708"),
            score: new Double(1),
            big: Long.fromString("9007199254740993"),
            when: new Date("2020-01-02T03:04:05.678Z"),
        });
        const hex = bytesToBsonText(bytes, "hex");

        const toon = outputOf(run("bson", "toon", hex));
        const back = run("toon", "bson", toon);

        expect(back.ok && back.output).toBe(hex);
    });
});

describe("JSON and TOON → BSON", () => {
    test("produces the bytes a driver would store", () => {
        const result = run("json", "bson", '{"name":"Ada","n":7}');

        expect(outputOf(result)).toBe(bytesToBsonText(serialize({ name: "Ada", n: 7 }), "hex"));
    });

    test("hands back the raw bytes for a download", () => {
        const result = run("json", "bson", '{"a":1}');

        expect(result.ok && result.bytes).toBeInstanceOf(Uint8Array);
    });

    test("carries no bytes for a text target", () => {
        expect(run("json", "toon", '{"a":1}')).toMatchObject({ ok: true, bytes: null });
    });

    test("refuses a root BSON cannot hold, whichever notation asked", () => {
        expect(run("json", "bson", "[1,2,3]")).toEqual({ ok: false, reason: "root_not_object" });
        expect(run("toon", "bson", "[2]: 1,2")).toEqual({ ok: false, reason: "root_not_object" });
        expect(run("json", "bson", '"text"')).toEqual({ ok: false, reason: "root_not_object" });
    });
});

describe("notes", () => {
    test("says the JSON is Extended JSON whenever BSON was the source", () => {
        expect(noteIds(run("bson", "json", SAMPLE_BSON_HEX))).toContain("extendedJson");
        expect(noteIds(run("json", "toon", SAMPLE_JSON))).not.toContain("extendedJson");
    });

    test("reports a relaxed read that did not survive, and stays quiet when it did", () => {
        const lossy = bytesToBsonText(serialize({ score: new Double(1) }), "hex");
        const intact = bytesToBsonText(serialize({ name: "Ada" }), "hex");

        expect(noteIds(run("bson", "json", lossy, { ejsonMode: "relaxed" }))).toContain(
            "relaxedLossy",
        );
        expect(noteIds(run("bson", "json", intact, { ejsonMode: "relaxed" }))).not.toContain(
            "relaxedLossy",
        );
        expect(noteIds(run("bson", "json", lossy, { ejsonMode: "canonical" }))).not.toContain(
            "relaxedLossy",
        );
    });

    test("warns that canonical wrappers cost TOON its tabular form", () => {
        expect(noteIds(run("bson", "toon", SAMPLE_BSON_HEX))).toContain("canonicalVerbose");
        expect(
            noteIds(run("bson", "toon", SAMPLE_BSON_HEX, { ejsonMode: "relaxed" })),
        ).not.toContain("canonicalVerbose");
        expect(noteIds(run("bson", "json", SAMPLE_BSON_HEX))).not.toContain("canonicalVerbose");
    });

    test("says numbers were given a type on the way into BSON", () => {
        expect(noteIds(run("json", "bson", '{"a":1}'))).toContain("numbersRetyped");
        expect(noteIds(run("bson", "bson", SAMPLE_BSON_HEX))).not.toContain("numbersRetyped");
    });

    test("only mentions a delimiter inside values when one was chosen to avoid quoting", () => {
        const withPipe = '{"note":"a|b"}';
        const withComma = '{"note":"a,b"}';

        expect(noteIds(run("json", "toon", withPipe, { toonDelimiter: "pipe" }))).toContain(
            "delimiterInValues",
        );
        expect(noteIds(run("json", "toon", withPipe, { toonDelimiter: "comma" }))).not.toContain(
            "delimiterInValues",
        );
        expect(noteIds(run("json", "toon", withComma, { toonDelimiter: "comma" }))).not.toContain(
            "delimiterInValues",
        );
    });
});

describe("failures", () => {
    test("treats a blank box as empty rather than invalid", () => {
        expect(run("json", "toon", "")).toEqual({ ok: false, reason: "empty" });
        expect(run("json", "toon", "   \n\t ")).toEqual({ ok: false, reason: "empty" });
    });

    test("stops before parsing something past the ceiling", () => {
        expect(run("json", "toon", `"${"a".repeat(MAX_INPUT_LENGTH)}"`)).toEqual({
            ok: false,
            reason: "too_large",
        });
    });

    test("names the notation BSON text failed to be", () => {
        expect(run("bson", "json", "zzzz")).toEqual({ ok: false, reason: "invalid_hex" });
        expect(run("bson", "json", "!!!!", { bsonEncoding: "base64" })).toEqual({
            ok: false,
            reason: "invalid_base64",
        });
    });

    test("reports bad JSON without an engine message", () => {
        expect(run("json", "toon", "{oops}")).toEqual({ ok: false, reason: "invalid_json" });
    });

    test("points at the line TOON gave up on", () => {
        const failure = run("toon", "json", "items[3]: 1,2");

        expect(failure).toMatchObject({ ok: false, reason: "invalid_toon", line: 1 });
    });

    test("lets a hand-edited length through when strict checking is off", () => {
        expect(run("toon", "json", "items[3]: 1,2", { toonStrict: false })).toMatchObject({
            ok: true,
        });
    });
});

describe("counts", () => {
    test("measures characters on both sides", () => {
        const result = run("json", "toon", SAMPLE_JSON);

        expect(result.ok && result.inputLength).toBe(SAMPLE_JSON.length);
        expect(result.ok && result.outputLength).toBe(outputOf(result).length);
        expect(result.ok && result.outputLength < result.inputLength).toBe(true);
    });
});
