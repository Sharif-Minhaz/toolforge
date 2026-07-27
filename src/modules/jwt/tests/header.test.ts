import { describe, expect, test } from "bun:test";

import { applyAlgorithmToHeader, readAlgorithmFromHeaderJson } from "@/modules/jwt/domain/header";
import { parseJsonObject } from "@/modules/jwt/domain/json";

describe("parseJsonObject", () => {
    test("accepts an object", () => {
        expect(parseJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    });

    test("separates unparseable text from a non-object", () => {
        expect(parseJsonObject("{oops")).toEqual({ ok: false, reason: "invalid_json" });
        expect(parseJsonObject("[1,2]")).toEqual({ ok: false, reason: "not_an_object" });
        expect(parseJsonObject("null")).toEqual({ ok: false, reason: "not_an_object" });
        expect(parseJsonObject('"a string"')).toEqual({ ok: false, reason: "not_an_object" });
    });
});

describe("readAlgorithmFromHeaderJson", () => {
    test("returns the declared algorithm", () => {
        expect(readAlgorithmFromHeaderJson('{"alg":"RS256"}')).toBe("RS256");
    });

    test("returns null rather than guessing", () => {
        expect(readAlgorithmFromHeaderJson('{"typ":"JWT"}')).toBeNull();
        expect(readAlgorithmFromHeaderJson('{"alg":256}')).toBeNull();
        expect(readAlgorithmFromHeaderJson("{oops")).toBeNull();
    });
});

describe("applyAlgorithmToHeader", () => {
    test("replaces alg in place, keeping every other parameter", () => {
        expect(applyAlgorithmToHeader('{"alg":"HS256","typ":"JWT","kid":"a"}', "ES384")).toBe(
            '{\n  "alg": "ES384",\n  "typ": "JWT",\n  "kid": "a"\n}',
        );
    });

    test("adds alg first when the header has none", () => {
        expect(applyAlgorithmToHeader('{"typ":"JWT"}', "HS512")).toBe(
            '{\n  "alg": "HS512",\n  "typ": "JWT"\n}',
        );
    });

    test("leaves half-typed text alone instead of overwriting it", () => {
        expect(applyAlgorithmToHeader('{"alg": "HS2', "RS256")).toBe('{"alg": "HS2');
    });
});
