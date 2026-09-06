import { describe, expect, test } from "bun:test";

import { dohResponseSchema, rdapNetworkSchema } from "@/modules/tools/validation/network";

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

describe("rdapNetworkSchema", () => {
    test("accepts a payload with nothing optional in it", () => {
        expect(rdapNetworkSchema.safeParse({}).success).toBe(true);
    });

    test("accepts nested entities several levels deep", () => {
        const parsed = rdapNetworkSchema.parse({
            entities: [
                {
                    roles: ["registrant"],
                    entities: [{ roles: ["abuse"], entities: [{ roles: ["technical"] }] }],
                },
            ],
        });

        expect(parsed.entities?.[0].entities?.[0].entities?.[0].roles).toEqual(["technical"]);
    });

    test("rejects a country that is not a string", () => {
        expect(rdapNetworkSchema.safeParse({ country: 7 }).success).toBe(false);
    });
});
