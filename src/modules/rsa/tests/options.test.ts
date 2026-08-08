import { describe, expect, test } from "bun:test";

import {
    isRsaHash,
    isRsaKeyFormat,
    isRsaKeySize,
    isRsaOutputFormat,
    isRsaUsage,
    isSlowKeySize,
    isWeakKeySize,
    keyFormatApplies,
} from "../domain/options";
import { rsaOptionsSchema, rsaSearchParamsSchema } from "../validation/rsa-options";
import { options } from "./factory";

describe("keyFormatApplies", () => {
    test("is false under JWK, which has no DER container to choose", () => {
        expect(keyFormatApplies("jwk")).toBe(false);
    });

    test("is true wherever a container is actually written", () => {
        expect(keyFormatApplies("pem")).toBe(true);
        expect(keyFormatApplies("der")).toBe(true);
    });
});

describe("key size judgements", () => {
    test("calls 1024 weak and nothing above it", () => {
        expect(isWeakKeySize(1024)).toBe(true);
        expect(isWeakKeySize(2048)).toBe(false);
        expect(isWeakKeySize(4096)).toBe(false);
    });

    test("calls only 4096 slow", () => {
        expect(isSlowKeySize(4096)).toBe(true);
        expect(isSlowKeySize(3072)).toBe(false);
    });
});

describe("type guards", () => {
    test("accept the offered values and reject the rest", () => {
        expect(isRsaKeySize(2048)).toBe(true);
        expect(isRsaKeySize(512)).toBe(false);
        expect(isRsaUsage("pss")).toBe(true);
        expect(isRsaUsage("ecdsa")).toBe(false);
        expect(isRsaHash("SHA-256")).toBe(true);
        expect(isRsaHash("SHA-1")).toBe(false);
        expect(isRsaKeyFormat("pkcs1")).toBe(true);
        expect(isRsaKeyFormat("sec1")).toBe(false);
        expect(isRsaOutputFormat("jwk")).toBe(true);
        expect(isRsaOutputFormat("openssh")).toBe(false);
    });
});

describe("rsaOptionsSchema", () => {
    test("accepts the workbench's own option set", () => {
        expect(rsaOptionsSchema.safeParse(options()).success).toBe(true);
    });

    test("refuses an exponent the generator would refuse too", () => {
        expect(rsaOptionsSchema.safeParse(options({ publicExponent: "4" })).success).toBe(false);
        expect(rsaOptionsSchema.safeParse(options({ publicExponent: "" })).success).toBe(false);
    });

    test("refuses a key size that is not on offer", () => {
        expect(rsaOptionsSchema.safeParse({ ...options(), keySize: 512 }).success).toBe(false);
    });
});

describe("rsaSearchParamsSchema", () => {
    test("reads a link that names every option", () => {
        const parsed = rsaSearchParamsSchema.parse({
            keySize: "4096",
            usage: "oaep",
            hash: "SHA-512",
            keyFormat: "pkcs1",
            outputFormat: "der",
            publicExponent: "3",
        });

        expect(parsed).toEqual({
            keySize: 4096,
            usage: "oaep",
            hash: "SHA-512",
            keyFormat: "pkcs1",
            outputFormat: "der",
            publicExponent: "3",
        });
    });

    /** One malformed value degrades to a default rather than throwing the page away. */
    test("drops only the field that was wrong", () => {
        const parsed = rsaSearchParamsSchema.parse({
            keySize: "banana",
            outputFormat: "jwk",
            publicExponent: "4",
        });

        expect(parsed.keySize).toBeUndefined();
        expect(parsed.publicExponent).toBeUndefined();
        expect(parsed.outputFormat).toBe("jwk");
    });

    test("opens on the defaults when the link carries nothing", () => {
        expect(rsaSearchParamsSchema.parse({})).toEqual({
            keySize: undefined,
            usage: undefined,
            hash: undefined,
            keyFormat: undefined,
            outputFormat: undefined,
            publicExponent: undefined,
        });
    });
});
