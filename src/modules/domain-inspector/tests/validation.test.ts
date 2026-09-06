import { describe, expect, test } from "bun:test";

import { MAX_INPUT_LENGTH } from "@/modules/domain-inspector/domain/constants";
import {
    inspectionRequestSchema,
    inspectionSearchParamsSchema,
    rdapDomainSchema,
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

describe("rdapDomainSchema", () => {
    test("accepts a payload with nothing optional in it", () => {
        expect(rdapDomainSchema.safeParse({}).success).toBe(true);
    });

    test("accepts nested entities several levels deep", () => {
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

    test("rejects a status list that is not a list of strings", () => {
        expect(rdapDomainSchema.safeParse({ status: "active" }).success).toBe(false);
    });
});
