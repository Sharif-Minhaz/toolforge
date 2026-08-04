import { describe, expect, test } from "bun:test";
import {
    Binary,
    BSONRegExp,
    Code,
    Decimal128,
    Double,
    Int32,
    Long,
    MaxKey,
    MinKey,
    ObjectId,
    serialize,
    Timestamp,
} from "bson";

import {
    bytesToBsonText,
    readBson,
    readBsonText,
    writeBson,
} from "@/modules/bson/domain/bson-codec";
import { SAMPLE_BSON_HEX } from "@/modules/bson/domain/constants";
import type { JsonObject } from "@/modules/bson/types";

/**
 * One field per BSON type the format still defines, so the canonical guarantee
 * below is exercised over the whole type system rather than a sample of it.
 * Deprecated types (undefined, DBPointer, symbol) are left out: nothing writes
 * them any more and the driver reads them into replacements.
 */
const EVERY_TYPE = {
    double: new Double(1),
    doubleFractional: new Double(1.5),
    string: "héllo 😀",
    document: { nested: { deeper: true } },
    array: [1, "two", null, { three: 3 }],
    binary: new Binary(new Uint8Array([0, 1, 254, 255])),
    objectId: new ObjectId("64b7c0f0e1a2b3c4d5e6f708"),
    boolean: true,
    date: new Date("2020-01-02T03:04:05.678Z"),
    null: null,
    regex: new BSONRegExp("^a.*z$", "im"),
    code: new Code("function () { return 1 }"),
    codeWithScope: new Code("function () { return x }", { x: 1 }),
    int32: new Int32(-7),
    timestamp: new Timestamp({ t: 1_700_000_000, i: 3 }),
    int64: Long.fromString("9007199254740993"),
    decimal128: Decimal128.fromString("19.99"),
    minKey: new MinKey(),
    maxKey: new MaxKey(),
};

function bytesOf(document: Record<string, unknown>): Uint8Array {
    return serialize(document);
}

function expectSameBytes(left: Uint8Array, right: Uint8Array) {
    expect(Array.from(right)).toEqual(Array.from(left));
}

describe("canonical Extended JSON", () => {
    /**
     * The invariant the whole tool rests on. Verified at the model rather than
     * at the text — two spellings of the same document are equally correct, so
     * comparing output strings would prove nothing and fail on the wrong thing.
     */
    test("round-trips a document carrying every type back to identical bytes", () => {
        const original = bytesOf(EVERY_TYPE);
        const read = readBson(original, "canonical");

        expect(read.ok).toBe(true);

        if (!read.ok) {
            return;
        }

        const written = writeBson(read.value);

        expect(written.ok).toBe(true);

        if (!written.ok) {
            return;
        }

        expectSameBytes(original, written.bytes);
    });

    test("round-trips each type on its own, so a failure names the type", () => {
        for (const [name, value] of Object.entries(EVERY_TYPE)) {
            const original = bytesOf({ [name]: value });
            const read = readBson(original, "canonical");

            expect(read.ok).toBe(true);

            if (!read.ok) {
                continue;
            }

            const written = writeBson(read.value);

            expect(written.ok).toBe(true);

            if (!written.ok) {
                continue;
            }

            expect({ [name]: Array.from(written.bytes) }).toEqual({
                [name]: Array.from(original),
            });
        }
    });

    test("keeps a double that happens to hold a whole number", () => {
        const read = readBson(bytesOf({ score: new Double(1) }), "canonical");

        expect(read.ok && read.value).toEqual({ score: { $numberDouble: "1.0" } } as JsonObject);
    });

    test("keeps an int64 past the range a JavaScript number can hold", () => {
        const read = readBson(bytesOf({ big: Long.fromString("9007199254740993") }), "canonical");

        expect(read.ok && read.value).toEqual({
            big: { $numberLong: "9007199254740993" },
        } as JsonObject);
    });

    test("never reports a canonical read as lossy", () => {
        const read = readBson(bytesOf(EVERY_TYPE), "canonical");

        expect(read.ok && read.lossy).toBe(false);
    });
});

describe("relaxed Extended JSON", () => {
    test("writes plain values where plain JSON can hold them", () => {
        const read = readBson(bytesOf({ n: new Int32(7), when: new Date(0), ok: true }), "relaxed");

        expect(read.ok && read.value).toEqual({
            n: 7,
            when: { $date: "1970-01-01T00:00:00Z" },
            ok: true,
        } as JsonObject);
    });

    test("reports a document it cannot return unchanged", () => {
        // A double holding 1 comes back as a plain `1`, which reads as an int32.
        expect(readBson(bytesOf({ score: new Double(1) }), "relaxed")).toMatchObject({
            ok: true,
            lossy: true,
        });

        // 2^53 + 1 has no exact double, so the value itself changes.
        expect(
            readBson(bytesOf({ big: Long.fromString("9007199254740993") }), "relaxed"),
        ).toMatchObject({ ok: true, lossy: true });
    });

    test("reports a document it can return unchanged", () => {
        const survivors = {
            string: "Ada",
            int32: new Int32(7),
            boolean: false,
            null: null,
            date: new Date("2020-01-02T03:04:05.678Z"),
            objectId: new ObjectId("64b7c0f0e1a2b3c4d5e6f708"),
            decimal128: Decimal128.fromString("19.99"),
            binary: new Binary(new Uint8Array([1, 2, 3])),
        };

        expect(readBson(bytesOf(survivors), "relaxed")).toMatchObject({ ok: true, lossy: false });
    });
});

describe("readBson failures", () => {
    test("names the size the header declared against the size that arrived", () => {
        const truncated = bytesOf({ name: "Ada" }).slice(0, 8);

        expect(readBson(truncated, "canonical")).toEqual({
            ok: false,
            reason: "invalid_bson",
            declaredBytes: 19,
            actualBytes: 8,
        });
    });

    test("survives a buffer too short to carry a header", () => {
        expect(readBson(new Uint8Array([1, 2]), "canonical")).toEqual({
            ok: false,
            reason: "invalid_bson",
            declaredBytes: undefined,
            actualBytes: 2,
        });
    });
});

describe("writeBson", () => {
    test("refuses a root that is not a document", () => {
        for (const value of [[1, 2, 3], "text", 5, true, null] as const) {
            expect(writeBson(value)).toEqual({ ok: false, reason: "root_not_object" });
        }
    });

    test("writes a whole number as int32 and a fractional one as double", () => {
        const written = writeBson({ whole: 1, fractional: 1.5 });

        expect(written.ok).toBe(true);

        if (written.ok) {
            expectSameBytes(
                bytesOf({ whole: new Int32(1), fractional: new Double(1.5) }),
                written.bytes,
            );
        }
    });

    test("writes an integer beyond 2^53 as int64 rather than losing it", () => {
        const written = writeBson({ big: { $numberLong: "9007199254740993" } });

        expect(written.ok).toBe(true);

        if (written.ok) {
            expectSameBytes(bytesOf({ big: Long.fromString("9007199254740993") }), written.bytes);
        }
    });

    test("accepts an empty document", () => {
        const written = writeBson({});

        expect(written.ok && Array.from(written.bytes)).toEqual([5, 0, 0, 0, 0]);
    });
});

describe("BSON as text", () => {
    test("reads hex in either case, and wrapped", () => {
        const bytes = bytesOf({ a: 1 });
        const hex = bytesToBsonText(bytes, "hex");

        expectSameBytes(bytes, readBsonText(hex, "hex") ?? new Uint8Array(0));
        expectSameBytes(bytes, readBsonText(hex.toUpperCase(), "hex") ?? new Uint8Array(0));
        expectSameBytes(
            bytes,
            readBsonText(`${hex.slice(0, 6)}\n${hex.slice(6)}`, "hex") ?? new Uint8Array(0),
        );
    });

    test("round-trips through base64", () => {
        const bytes = bytesOf({ a: 1 });

        expectSameBytes(
            bytes,
            readBsonText(bytesToBsonText(bytes, "base64"), "base64") ?? new Uint8Array(0),
        );
    });

    test("rejects text the chosen notation cannot read", () => {
        expect(readBsonText("nothex", "hex")).toBeNull();
        expect(readBsonText("abc", "hex")).toBeNull();
        expect(readBsonText("!!!!", "base64")).toBeNull();
    });
});

describe("the sample document", () => {
    /**
     * A literal nobody can read is a literal nobody can check. This decodes it
     * rather than trusting the nibbles, so a typo in the constant fails here
     * instead of teaching a reader that the tool is broken.
     */
    test("decodes to the document it claims to be", () => {
        const bytes = readBsonText(SAMPLE_BSON_HEX, "hex");

        expect(bytes).not.toBeNull();

        const read = readBson(bytes ?? new Uint8Array(0), "canonical");

        expect(read.ok && read.value).toEqual({
            _id: { $oid: "64b7c0f0e1a2b3c4d5e6f708" },
            name: "Ada",
            score: { $numberDouble: "4.5" },
            active: true,
        } as JsonObject);
    });
});
