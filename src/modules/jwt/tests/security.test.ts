import { describe, expect, test } from "bun:test";

import { encodeTextToBase64Url } from "@/modules/jwt/domain/base64url";
import { LONG_LIVED_TOKEN_DAYS, SECONDS_PER_DAY } from "@/modules/jwt/domain/constants";
import { decodeJwt } from "@/modules/jwt/domain/decode";
import { inspectSecurity } from "@/modules/jwt/domain/security";
import type { DecodedJwt, JwtFindingCode } from "@/modules/jwt/types";

const NOW = new Date("2026-07-27T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

/** A live token with nothing to report, used as the baseline everywhere below. */
const HEALTHY_PAYLOAD = { sub: "1234567890", exp: NOW_SECONDS + 3600, iat: NOW_SECONDS };

function decodeOrThrow(header: unknown, payload: unknown, signature = "c2ln"): DecodedJwt {
    const token = [
        encodeTextToBase64Url(JSON.stringify(header)),
        encodeTextToBase64Url(JSON.stringify(payload)),
        signature,
    ].join(".");
    const result = decodeJwt(token);

    if (!result.ok) {
        throw new Error(`expected a successful decode, got ${result.reason}`);
    }

    return result;
}

function codesFor(header: unknown, payload: unknown, signature = "c2ln"): JwtFindingCode[] {
    return inspectSecurity(decodeOrThrow(header, payload, signature), NOW).map(
        (finding) => finding.code,
    );
}

describe("inspectSecurity", () => {
    test("reports nothing on a signed, live, minimal token", () => {
        expect(codesFor({ alg: "HS256", typ: "JWT" }, HEALTHY_PAYLOAD)).toEqual([]);
    });

    test("flags an unsigned token", () => {
        expect(codesFor({ alg: "none" }, HEALTHY_PAYLOAD, "")).toContain("algNone");
        expect(codesFor({ alg: "NONE" }, HEALTHY_PAYLOAD, "")).toContain("algNone");
    });

    test("flags a header with no algorithm at all", () => {
        const codes = codesFor({ typ: "JWT" }, HEALTHY_PAYLOAD);

        expect(codes).toContain("algMissing");
        expect(codes).not.toContain("algNone");
    });

    test("names the header parameters that can redirect key lookup", () => {
        const findings = inspectSecurity(
            decodeOrThrow(
                { alg: "RS256", jku: "https://evil.example/keys", x5u: "https://evil.example/c" },
                HEALTHY_PAYLOAD,
            ),
            NOW,
        );
        const finding = findings.find((entry) => entry.code === "remoteKeyHeader");

        expect(finding?.severity).toBe("critical");
        expect(finding?.subjects).toEqual(["jku", "x5u"]);
    });

    test("flags an expired token", () => {
        expect(
            codesFor({ alg: "HS256" }, { ...HEALTHY_PAYLOAD, exp: NOW_SECONDS - 3600 }),
        ).toContain("expired");
    });

    test("flags a token that is not valid yet", () => {
        expect(
            codesFor({ alg: "HS256" }, { ...HEALTHY_PAYLOAD, nbf: NOW_SECONDS + 3600 }),
        ).toContain("notYetValid");
    });

    test("flags a token with no expiry", () => {
        expect(codesFor({ alg: "HS256" }, { sub: "1" })).toContain("missingExp");
    });

    test("notes an expiry far enough out to defeat the point", () => {
        const exp = NOW_SECONDS + (LONG_LIVED_TOKEN_DAYS + 1) * SECONDS_PER_DAY;
        const findings = inspectSecurity(decodeOrThrow({ alg: "HS256" }, { exp }), NOW);

        expect(findings.find((entry) => entry.code === "longLived")?.severity).toBe("info");
        expect(findings.map((entry) => entry.code)).not.toContain("missingExp");
    });

    test("finds a credential buried in a nested claim", () => {
        const findings = inspectSecurity(
            decodeOrThrow(
                { alg: "HS256" },
                { ...HEALTHY_PAYLOAD, user: { name: "ada", db_password: "hunter2" } },
            ),
            NOW,
        );
        const finding = findings.find((entry) => entry.code === "sensitiveClaim");

        expect(finding?.severity).toBe("critical");
        expect(finding?.subjects).toEqual(["user.db_password"]);
    });

    test("matches sensitive names whatever the casing or separator", () => {
        const findings = inspectSecurity(
            decodeOrThrow(
                { alg: "HS256" },
                { ...HEALTHY_PAYLOAD, apiKey: "k", CLIENT_SECRET: "s" },
            ),
            NOW,
        );

        expect(findings.find((entry) => entry.code === "sensitiveClaim")?.subjects).toEqual([
            "apiKey",
            "CLIENT_SECRET",
        ]);
    });

    test("leaves ordinary token claims alone", () => {
        expect(
            codesFor({ alg: "HS256" }, { ...HEALTHY_PAYLOAD, refresh_token_id: "abc" }),
        ).not.toContain("sensitiveClaim");
    });

    test("notes a nested token", () => {
        expect(codesFor({ alg: "HS256", cty: "JWT" }, HEALTHY_PAYLOAD)).toContain("nestedToken");
    });

    test("leads with the most severe finding", () => {
        const codes = codesFor({ alg: "none", cty: "JWT" }, { password: "hunter2" }, "");

        expect(codes.slice(0, 2).toSorted()).toEqual(["algNone", "sensitiveClaim"]);
        expect(codes.at(-1)).toBe("nestedToken");
    });
});
