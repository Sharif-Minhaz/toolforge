import { describe, expect, test } from "bun:test";

import {
    getKeyFormat,
    isSecretTooShort,
    resolveExpectedAlgorithm,
} from "@/modules/jwt/domain/algorithms";
import { EXAMPLE_LIFETIME_SECONDS } from "@/modules/jwt/domain/constants";
import { decodeJwt } from "@/modules/jwt/domain/decode";
import { createJwtExample } from "@/modules/jwt/domain/examples";
import { inspectSecurity } from "@/modules/jwt/domain/security";
import type { JwtAlgorithm } from "@/modules/jwt/types";

const ISSUED_AT = new Date("2026-07-27T12:00:00.000Z");
const ISSUED_SECONDS = Math.floor(ISSUED_AT.getTime() / 1000);

/** One per family, so the suite covers every key path without 13 keygens. */
const FAMILY_SAMPLES: readonly JwtAlgorithm[] = ["HS256", "RS256", "PS256", "ES256", "EdDSA"];

describe("createJwtExample", () => {
    test("issues a live token with the injected clock", async () => {
        const result = await createJwtExample({ algorithm: "HS256", issuedAt: ISSUED_AT });

        if (!result.ok) {
            throw new Error(`expected an example, got ${result.reason}`);
        }

        const token = decodeJwt(result.example.token);

        if (!token.ok) {
            throw new Error("the example should decode");
        }

        expect(token.payload.iat).toBe(ISSUED_SECONDS);
        expect(token.payload.exp).toBe(ISSUED_SECONDS + EXAMPLE_LIFETIME_SECONDS);
    });

    test("hands back key material in the shape the algorithm needs", async () => {
        for (const algorithm of FAMILY_SAMPLES) {
            const result = await createJwtExample({ algorithm, issuedAt: ISSUED_AT });

            if (!result.ok) {
                throw new Error(`expected an example for ${algorithm}, got ${result.reason}`);
            }

            if (getKeyFormat(algorithm) === "secret") {
                expect(result.example.signingKey).toBe(result.example.verificationKey);
            } else {
                expect(result.example.signingKey).toContain("BEGIN PRIVATE KEY");
                expect(result.example.verificationKey).toContain("BEGIN PUBLIC KEY");
            }
        }
    }, 30_000);

    test("writes the chosen algorithm into the header it hands back", async () => {
        const result = await createJwtExample({ algorithm: "HS384", issuedAt: ISSUED_AT });

        if (!result.ok) {
            throw new Error(`expected an example, got ${result.reason}`);
        }

        expect(JSON.parse(result.example.headerJson)).toEqual({ alg: "HS384", typ: "JWT" });
    });

    test("produces a token with nothing to flag at issue time", async () => {
        const result = await createJwtExample({ algorithm: "HS256", issuedAt: ISSUED_AT });

        if (!result.ok) {
            throw new Error(`expected an example, got ${result.reason}`);
        }

        const token = decodeJwt(result.example.token);

        expect(token.ok && inspectSecurity(token, ISSUED_AT)).toEqual([]);
    });

    test("uses a demo secret long enough for every HMAC size", async () => {
        for (const algorithm of ["HS256", "HS384", "HS512"] as const) {
            const result = await createJwtExample({ algorithm, issuedAt: ISSUED_AT });

            if (!result.ok) {
                throw new Error(`expected an example for ${algorithm}`);
            }

            const bytes = new TextEncoder().encode(result.example.signingKey).length;

            expect(isSecretTooShort(algorithm, bytes)).toBe(false);
        }
    });
});

describe("isSecretTooShort", () => {
    test("measures against the hash the algorithm feeds", () => {
        expect(isSecretTooShort("HS256", 31)).toBe(true);
        expect(isSecretTooShort("HS256", 32)).toBe(false);
        expect(isSecretTooShort("HS512", 32)).toBe(true);
    });

    test("says nothing about an empty box or a key pair", () => {
        expect(isSecretTooShort("HS256", 0)).toBe(false);
        expect(isSecretTooShort("RS256", 1)).toBe(false);
    });
});

describe("resolveExpectedAlgorithm", () => {
    test("prefers what the reader chose", () => {
        expect(resolveExpectedAlgorithm("RS256", "HS256", "HS256")).toBe("RS256");
    });

    test("starts from the token's own header when nothing is chosen", () => {
        expect(resolveExpectedAlgorithm(null, "ES512", "HS256")).toBe("ES512");
    });

    test("falls back when the header names something unsupported", () => {
        expect(resolveExpectedAlgorithm(null, "none", "HS256")).toBe("HS256");
        expect(resolveExpectedAlgorithm(null, null, "HS256")).toBe("HS256");
    });
});
