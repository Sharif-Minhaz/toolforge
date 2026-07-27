import { describe, expect, test } from "bun:test";

import { isRepairable, MAX_SHARED_TEXT_LENGTH } from "@/modules/json/domain/constants";
import { requiresContainerRoot, rejectsUnpairedSurrogates } from "@/modules/json/domain/spec";
import {
    jsonFormatOptionsSchema,
    jsonSearchParamsSchema,
} from "@/modules/json/validation/format-options";
import {
    JSON_ERROR_CODES,
    JSON_SPECS,
    type JsonErrorCode,
    type JsonFormatOptions,
} from "@/modules/json/types";

describe("jsonSearchParamsSchema", () => {
    test("reads a fully specified link", () => {
        const parsed = jsonSearchParamsSchema.parse({
            mode: "minify",
            text: '{"a":1}',
            indent: "tab",
            spec: "rfc4627",
            repair: "1",
            sortKeys: "true",
            escapeUnicode: "off",
        });

        expect(parsed).toEqual({
            mode: "minify",
            text: '{"a":1}',
            indent: "tab",
            spec: "rfc4627",
            repair: true,
            sortKeys: true,
            escapeUnicode: false,
        });
    });

    test("degrades one bad field to undefined instead of throwing the page away", () => {
        const parsed = jsonSearchParamsSchema.parse({
            mode: "sideways",
            indent: "space2",
            spec: "rfc9999",
            repair: "yes-please",
        });

        expect(parsed.mode).toBeUndefined();
        expect(parsed.spec).toBeUndefined();
        expect(parsed.repair).toBeUndefined();
        expect(parsed.indent).toBe("space2");
    });

    test("drops a shared text longer than the ceiling", () => {
        const parsed = jsonSearchParamsSchema.parse({
            text: "a".repeat(MAX_SHARED_TEXT_LENGTH + 1),
        });

        expect(parsed.text).toBeUndefined();
    });

    test("keeps a shared text exactly at the ceiling", () => {
        const text = "a".repeat(MAX_SHARED_TEXT_LENGTH);

        expect(jsonSearchParamsSchema.parse({ text }).text).toBe(text);
    });

    test("accepts an empty query", () => {
        expect(jsonSearchParamsSchema.parse({})).toEqual({});
    });
});

describe("jsonFormatOptionsSchema", () => {
    test("accepts a complete option set", () => {
        const options: JsonFormatOptions = {
            indent: "space4",
            spec: "rfc8259",
            repair: true,
            sortKeys: false,
            escapeUnicode: false,
        };

        expect(jsonFormatOptionsSchema.parse(options)).toEqual(options);
    });

    test("rejects a missing field rather than filling one in", () => {
        expect(jsonFormatOptionsSchema.safeParse({ indent: "space4" }).success).toBe(false);
    });
});

describe("isRepairable", () => {
    for (const code of [
        "trailing_comma",
        "missing_comma",
        "comment",
        "non_standard_quote",
        "unquoted_key",
        "non_standard_literal",
        "control_character",
        "invalid_escape",
        "invalid_number",
    ] as JsonErrorCode[]) {
        test(`offers repair for ${code}`, () => {
            expect(isRepairable(code)).toBe(true);
        });
    }

    for (const code of [
        "empty",
        "too_large",
        "too_deep",
        "unexpected_token",
        "unexpected_end",
        "unterminated_string",
        "invalid_literal",
        "trailing_content",
        "root_not_container",
        "unpaired_surrogate",
    ] as JsonErrorCode[]) {
        test(`does not offer repair for ${code}`, () => {
            expect(isRepairable(code)).toBe(false);
        });
    }

    test("covers every declared error code, so no case is left unclassified", () => {
        for (const code of JSON_ERROR_CODES) {
            expect(typeof isRepairable(code)).toBe("boolean");
        }
    });
});

describe("spec rules", () => {
    test("only RFC 4627 constrains the root value", () => {
        expect(JSON_SPECS.filter(requiresContainerRoot)).toEqual(["rfc4627"]);
    });

    test("only RFC 8259 treats a lone surrogate as fatal", () => {
        expect(JSON_SPECS.filter(rejectsUnpairedSurrogates)).toEqual(["rfc8259"]);
    });
});
