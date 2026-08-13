import { describe, expect, test } from "bun:test";

import { decideMcpAccess, readBearerToken } from "@/modules/mcp/domain/access";

/**
 * The gate, in both directions.
 *
 * The case worth stating twice is the third one: an unconfigured deployment
 * refuses networked tools rather than serving them. A limiter or a gate that
 * degrades toward "allow" when its configuration is missing is the failure this
 * repository names explicitly in `CLAUDE.md`, and it is the one that would be
 * easiest to introduce here by writing `configured.length === 0` as a pass.
 */

describe("decideMcpAccess", () => {
    test("lets an offline tool through with no token at all", () => {
        expect(decideMcpAccess("offline", null, "")).toEqual({ allowed: true });
    });

    test("lets a network tool through on the right token", () => {
        expect(decideMcpAccess("network", "s3cret", "s3cret")).toEqual({ allowed: true });
    });

    test("refuses a network tool when the deployment configured no token", () => {
        expect(decideMcpAccess("network", "anything", "   ")).toEqual({
            allowed: false,
            reason: "token_missing",
        });
    });

    test("refuses a network tool when the caller sent none", () => {
        expect(decideMcpAccess("network", null, "s3cret")).toEqual({
            allowed: false,
            reason: "token_required",
        });
    });

    test("refuses a network tool on a wrong token", () => {
        expect(decideMcpAccess("network", "s3crft", "s3cret")).toEqual({
            allowed: false,
            reason: "token_invalid",
        });
    });

    test("ignores whitespace around the configured token", () => {
        expect(decideMcpAccess("network", "s3cret", " s3cret ")).toEqual({ allowed: true });
    });
});

describe("readBearerToken", () => {
    for (const [header, expected] of [
        ["Bearer abc123", "abc123"],
        ["bearer abc123", "abc123"],
        ["BEARER  abc123", "abc123"],
        ["  Bearer abc123  ", "abc123"],
        // Not a bearer scheme: treated as absent so the caller is told the
        // token is required rather than that it was wrong.
        ["Basic abc123", null],
        ["abc123", null],
        ["Bearer", null],
        ["Bearer ", null],
    ] as const) {
        test(`reads ${JSON.stringify(header)} as ${JSON.stringify(expected)}`, () => {
            expect(readBearerToken(header)).toBe(expected);
        });
    }

    test("reads an absent header as absent", () => {
        expect(readBearerToken(null)).toBe(null);
    });
});
