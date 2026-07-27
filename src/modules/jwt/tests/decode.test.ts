import { describe, expect, test } from "bun:test";

import { encodeTextToBase64Url } from "@/modules/jwt/domain/base64url";
import { MAX_JWT_INPUT_LENGTH } from "@/modules/jwt/domain/constants";
import { decodeJwt, normalizeToken } from "@/modules/jwt/domain/decode";
import type { DecodedJwt } from "@/modules/jwt/types";

/**
 * The canonical HS256 example, signed with `your-256-bit-secret`. Reproduced
 * independently with Node's `crypto` rather than copied from memory.
 */
const CANONICAL_TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" +
    ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

function buildToken(header: unknown, payload: unknown, signature = "c2ln"): string {
    return [
        encodeTextToBase64Url(JSON.stringify(header)),
        encodeTextToBase64Url(JSON.stringify(payload)),
        signature,
    ].join(".");
}

function decoded(token: string): DecodedJwt {
    const result = decodeJwt(token);

    if (!result.ok) {
        throw new Error(`expected a successful decode, got ${result.reason}`);
    }

    return result;
}

describe("normalizeToken", () => {
    test("drops whitespace left by a wrapped paste", () => {
        expect(normalizeToken("  ab.\ncd.\tef ")).toBe("ab.cd.ef");
    });

    test("absorbs an Authorization scheme", () => {
        expect(normalizeToken("Bearer ab.cd.ef")).toBe("ab.cd.ef");
        expect(normalizeToken("bearer ab.cd.ef")).toBe("ab.cd.ef");
    });

    test("leaves a bare token untouched", () => {
        expect(normalizeToken(CANONICAL_TOKEN)).toBe(CANONICAL_TOKEN);
    });
});

describe("decodeJwt", () => {
    test("reads the canonical example", () => {
        const result = decoded(CANONICAL_TOKEN);

        expect(result.header).toEqual({ alg: "HS256", typ: "JWT" });
        expect(result.payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
        expect(result.algorithm).toBe("HS256");
        expect(result.segments.signature).toBe("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
    });

    test("keeps the normalized token so verification signs the same bytes", () => {
        expect(decoded(`Bearer ${CANONICAL_TOKEN}\n`).token).toBe(CANONICAL_TOKEN);
    });

    test("re-indents both halves for display", () => {
        const result = decoded(CANONICAL_TOKEN);

        expect(result.headerJson).toBe('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
        expect(result.payloadJson.startsWith('{\n  "sub": "1234567890",')).toBe(true);
    });

    test("reports an empty input rather than a malformed one", () => {
        expect(decodeJwt("   ")).toEqual({ ok: false, reason: "empty" });
    });

    test("reports the segment count when it is not three", () => {
        expect(decodeJwt("only.two")).toEqual({
            ok: false,
            reason: "segment_count",
            segmentCount: 2,
        });
        expect(decodeJwt("a.b.c.d")).toEqual({
            ok: false,
            reason: "segment_count",
            segmentCount: 4,
        });
    });

    test("names a five-part token as encrypted rather than malformed", () => {
        expect(decodeJwt("a.b.c.d.e")).toEqual({
            ok: false,
            reason: "encrypted_token",
            segmentCount: 5,
        });
    });

    test("attributes a bad alphabet to the segment that carries it", () => {
        expect(decodeJwt("not+base64.eyJhIjoxfQ.sig")).toEqual({
            ok: false,
            reason: "invalid_base64",
            segment: "header",
        });
        expect(decodeJwt("eyJhIjoxfQ.not+base64.sig")).toEqual({
            ok: false,
            reason: "invalid_base64",
            segment: "payload",
        });
        expect(decodeJwt("eyJhIjoxfQ.eyJhIjoxfQ.not+base64")).toEqual({
            ok: false,
            reason: "invalid_base64",
            segment: "signature",
        });
    });

    test("reports JSON that does not parse", () => {
        expect(decodeJwt(`${encodeTextToBase64Url("{oops")}.eyJhIjoxfQ.sig`)).toEqual({
            ok: false,
            reason: "invalid_json",
            segment: "header",
        });
    });

    test("rejects a payload that is valid JSON but not an object", () => {
        expect(decodeJwt(buildToken({ alg: "HS256" }, [1, 2, 3]))).toEqual({
            ok: false,
            reason: "not_an_object",
            segment: "payload",
        });
    });

    test("accepts the empty signature an unsigned token carries", () => {
        const result = decoded(buildToken({ alg: "none" }, { sub: "1" }, ""));

        expect(result.algorithm).toBe("none");
        expect(result.segments.signature).toBe("");
    });

    test("reports a missing alg as null rather than guessing", () => {
        expect(decoded(buildToken({ typ: "JWT" }, { sub: "1" })).algorithm).toBeNull();
        expect(decoded(buildToken({ alg: 256 }, { sub: "1" })).algorithm).toBeNull();
    });

    test("refuses an input past the ceiling", () => {
        const oversized = `a.b.${"c".repeat(MAX_JWT_INPUT_LENGTH)}`;

        expect(decodeJwt(oversized)).toEqual({ ok: false, reason: "too_large" });
    });
});
