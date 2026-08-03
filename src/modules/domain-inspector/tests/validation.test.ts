import { describe, expect, test } from "bun:test";

import { MAX_INPUT_LENGTH } from "@/modules/domain-inspector/domain/constants";
import {
    dohResponseSchema,
    inspectionRequestSchema,
    inspectionSearchParamsSchema,
    rdapDomainSchema,
    rdapNetworkSchema,
} from "@/modules/domain-inspector/validation/inspection";

describe("inspectionRequestSchema", () => {
    const valid = {
        token: "turnstile-token",
        host: "example.com",
        resolver: "cloudflare",
        probeSite: true,
    };

    test("accepts a well-formed payload", () => {
        expect(inspectionRequestSchema.safeParse(valid).success).toBe(true);
    });

    const REJECTED = [
        { ...valid, token: "" },
        { ...valid, host: "" },
        { ...valid, host: "a".repeat(MAX_INPUT_LENGTH + 1) },
        { ...valid, resolver: "opendns" },
        { ...valid, probeSite: "yes" },
    ];

    for (const [index, payload] of REJECTED.entries()) {
        test(`rejects payload ${index}`, () => {
            expect(inspectionRequestSchema.safeParse(payload).success).toBe(false);
        });
    }
});

describe("inspectionSearchParamsSchema", () => {
    test("keeps what it recognises", () => {
        expect(
            inspectionSearchParamsSchema.parse({ host: "example.com", resolver: "google" }),
        ).toEqual({ host: "example.com", resolver: "google" });
    });

    test("degrades one bad field to undefined instead of throwing the page away", () => {
        expect(
            inspectionSearchParamsSchema.parse({ host: "example.com", resolver: "nonsense" }),
        ).toEqual({ host: "example.com", resolver: undefined });
    });

    test("accepts an empty query string", () => {
        expect(inspectionSearchParamsSchema.parse({})).toEqual({
            host: undefined,
            resolver: undefined,
        });
    });
});

describe("dohResponseSchema", () => {
    test("reads a normal answer", () => {
        const parsed = dohResponseSchema.parse({
            Status: 0,
            AD: true,
            Answer: [{ name: "example.com.", type: 1, TTL: 300, data: "93.184.216.34" }],
        });

        expect(parsed.Answer?.[0].data).toBe("93.184.216.34");
    });

    test("accepts an answer-less NXDOMAIN", () => {
        expect(dohResponseSchema.parse({ Status: 3 }).Answer).toBeUndefined();
    });

    test("defaults a missing TTL rather than dropping the record", () => {
        const parsed = dohResponseSchema.parse({
            Status: 0,
            Answer: [{ name: "x.", type: 16, data: '"v=spf1 -all"' }],
        });

        expect(parsed.Answer?.[0].TTL).toBe(0);
    });

    test("rejects a payload with no status", () => {
        expect(dohResponseSchema.safeParse({ Answer: [] }).success).toBe(false);
    });
});

describe("RDAP schemas", () => {
    test("accept a payload with nothing optional in it", () => {
        expect(rdapDomainSchema.safeParse({}).success).toBe(true);
        expect(rdapNetworkSchema.safeParse({}).success).toBe(true);
    });

    test("accept nested entities several levels deep", () => {
        const parsed = rdapDomainSchema.parse({
            entities: [
                {
                    roles: ["registrar"],
                    entities: [{ roles: ["abuse"], entities: [{ roles: ["technical"] }] }],
                },
            ],
        });

        expect(parsed.entities?.[0].entities?.[0].entities?.[0].roles).toEqual(["technical"]);
    });

    test("reject a status list that is not a list of strings", () => {
        expect(rdapDomainSchema.safeParse({ status: "active" }).success).toBe(false);
    });
});
