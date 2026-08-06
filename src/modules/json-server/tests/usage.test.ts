import { describe, expect, test } from "bun:test";

import {
    DOCUMENT_WARN_RATIO,
    MAX_DOCUMENT_BYTES,
    MAX_UPLOAD_BYTES,
} from "@/modules/json-server/domain/constants";
import { formatDocumentText } from "@/modules/json-server/domain/format";
import { checkServerName } from "@/modules/json-server/domain/server-name";
import { describeUsage } from "@/modules/json-server/domain/usage";

describe("describeUsage", () => {
    test("an empty server reports nothing used", () => {
        expect(describeUsage(0)).toEqual({
            bytes: 0,
            limit: MAX_DOCUMENT_BYTES,
            percent: 0,
            nearLimit: false,
            full: false,
        });
    });

    test("reports the percentage of the storage ceiling", () => {
        expect(describeUsage(MAX_DOCUMENT_BYTES / 2).percent).toBe(50);
    });

    /** The warning is what makes the lock something a reader saw coming. */
    test("warns from the threshold, not before it", () => {
        const threshold = Math.ceil(MAX_DOCUMENT_BYTES * DOCUMENT_WARN_RATIO);

        expect(describeUsage(threshold - 1).nearLimit).toBe(false);
        expect(describeUsage(threshold).nearLimit).toBe(true);
    });

    test("is full at the ceiling, not one byte past it", () => {
        expect(describeUsage(MAX_DOCUMENT_BYTES - 1).full).toBe(false);
        expect(describeUsage(MAX_DOCUMENT_BYTES).full).toBe(true);
    });

    /** A row that somehow exceeded the ceiling must not draw a bar past its box. */
    test("never reports more than a hundred percent", () => {
        expect(describeUsage(MAX_DOCUMENT_BYTES * 3).percent).toBe(100);
    });

    test("a negative count is read as zero rather than as a negative bar", () => {
        expect(describeUsage(-10)).toMatchObject({ bytes: 0, percent: 0 });
    });

    /**
     * The gap between the two ceilings is the room to actually use the server.
     * Were they equal, a server created at its upload limit would be full before
     * its first `POST`.
     */
    test("the upload ceiling leaves room below the storage ceiling", () => {
        expect(MAX_UPLOAD_BYTES).toBeLessThan(MAX_DOCUMENT_BYTES);
        expect(describeUsage(MAX_UPLOAD_BYTES).full).toBe(false);
    });
});

describe("formatDocumentText", () => {
    test("indents with two spaces", () => {
        expect(formatDocumentText('{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    });

    /** A Format button that emptied the editor on a typo is the worst reading of it. */
    test("returns null rather than rewriting something it could not read", () => {
        expect(formatDocumentText("{nope")).toBeNull();
        expect(formatDocumentText("")).toBeNull();
    });

    /**
     * The reason this is not `JSON.stringify(JSON.parse(text), null, 2)`: that
     * routes every number through a double, so a nineteen-digit id silently
     * rounds — in precisely the file people paste real ids into.
     */
    test("keeps a number literal past 2^53 exactly as written", () => {
        expect(formatDocumentText('{"id":9007199254740993}')).toContain("9007199254740993");
    });

    test("is idempotent", () => {
        const once = formatDocumentText('{"a":1}') as string;

        expect(formatDocumentText(once)).toBe(once);
    });

    /** Repair is off: the studio must not silently change what somebody pasted. */
    test("does not repair a trailing comma", () => {
        expect(formatDocumentText('{"a":1,}')).toBeNull();
    });
});

describe("checkServerName", () => {
    test("collapses the whitespace a paste brings with it", () => {
        expect(checkServerName("  Storefront \n\t fixtures ")).toEqual({
            ok: true,
            name: "Storefront fixtures",
        });
    });

    test("refuses a name with nothing in it", () => {
        expect(checkServerName("   ")).toEqual({ ok: false, reason: "invalid_name" });
    });

    /** Counted in code points, or emoji and Bengali conjuncts hit the cap early. */
    test("counts code points rather than UTF-16 units", () => {
        expect(checkServerName("🚀".repeat(60)).ok).toBe(true);
        expect(checkServerName("🚀".repeat(61)).ok).toBe(false);
    });
});
