import { describe, expect, test } from "bun:test";

import {
    MAX_UUID_QUANTITY,
    MIN_UUID_QUANTITY,
    UUID_PATTERN,
} from "@/modules/uuid/domain/constants";
import {
    generateUuid,
    generateUuids,
    isValidQuantity,
    readUuidVariant,
    readUuidVersion,
    UuidQuantityError,
} from "@/modules/uuid/domain/generate";
import { UUID_VERSIONS, type UuidVersion } from "@/modules/uuid/types";

/** Big-endian 48-bit Unix timestamp that a v7 UUID carries in its first six octets. */
function readV7Timestamp(uuid: string): number {
    return Number.parseInt(uuid.replaceAll("-", "").slice(0, 12), 16);
}

describe("generateUuid", () => {
    for (const version of UUID_VERSIONS) {
        test(`v${version} produces the canonical 8-4-4-4-12 form`, () => {
            const uuid = generateUuid(version);

            expect(uuid).toMatch(UUID_PATTERN);
            expect(uuid).toHaveLength(36);
        });

        test(`v${version} stamps the correct version nibble`, () => {
            expect(readUuidVersion(generateUuid(version))).toBe(version);
        });

        test(`v${version} stamps the RFC 9562 variant bits`, () => {
            // The two most significant bits of octet 8 must be 0b10.
            expect(readUuidVariant(generateUuid(version))).toBe(0b10);
        });
    }

    test("falls back to v4 for an unexpected version value", () => {
        const uuid = generateUuid(9 as UuidVersion);

        expect(uuid).toMatch(UUID_PATTERN);
        expect(readUuidVersion(uuid)).toBe(4);
    });
});

describe("version 1", () => {
    test("sets the multicast bit on the node id, as required for random nodes", () => {
        const nodeFirstOctet = Number.parseInt(generateUuid(1).slice(24, 26), 16);

        expect(nodeFirstOctet & 0x01).toBe(0x01);
    });

    test("stays unique across a dense burst inside one millisecond", () => {
        const uuids = generateUuids({ version: 1, quantity: MAX_UUID_QUANTITY });

        expect(new Set(uuids).size).toBe(MAX_UUID_QUANTITY);
    });

    test("keeps a stable node id within a session", () => {
        const [first, second] = generateUuids({ version: 1, quantity: 2 });

        expect(first.slice(24)).toBe(second.slice(24));
    });
});

describe("version 4", () => {
    test("produces no duplicates across a large sample", () => {
        const uuids = Array.from({ length: 2000 }, () => generateUuid(4));

        expect(new Set(uuids).size).toBe(2000);
    });

    test("varies the random payload between calls", () => {
        expect(generateUuid(4)).not.toBe(generateUuid(4));
    });
});

describe("version 7", () => {
    test("encodes the current Unix time in the leading 48 bits", () => {
        const before = Date.now();
        const timestamp = readV7Timestamp(generateUuid(7));

        expect(timestamp).toBeGreaterThanOrEqual(before - 1000);
        expect(timestamp).toBeLessThanOrEqual(Date.now() + 1000);
    });

    test("returns a strictly ascending batch so ids stay index-friendly", () => {
        const uuids = generateUuids({ version: 7, quantity: MAX_UUID_QUANTITY });

        for (let index = 1; index < uuids.length; index += 1) {
            expect(uuids[index] > uuids[index - 1]).toBe(true);
        }
    });

    test("matches its own lexicographic sort order", () => {
        const uuids = generateUuids({ version: 7, quantity: 200 });

        expect(uuids.toSorted()).toEqual(uuids);
    });

    test("keeps ascending once the counter has borrowed from the next millisecond", () => {
        // Overflowing the 12-bit counter pushes the timestamp one millisecond
        // ahead of the clock. Every id after that arrives with a `now` that is
        // behind the borrowed timestamp, which must not reseed the counter.
        // `rand_a` is 12 bits, so 4096 values; twice that forces an overflow.
        const frozen = Date.now();
        const uuids = Array.from({ length: 4096 * 2 }, () => generateUuid(7, frozen));

        for (let index = 1; index < uuids.length; index += 1) {
            expect(uuids[index] > uuids[index - 1]).toBe(true);
        }
    });

    test("stays unique across a full batch", () => {
        const uuids = generateUuids({ version: 7, quantity: MAX_UUID_QUANTITY });

        expect(new Set(uuids).size).toBe(MAX_UUID_QUANTITY);
    });
});

describe("generateUuids", () => {
    for (const version of UUID_VERSIONS) {
        test(`v${version} returns exactly the requested count`, () => {
            expect(generateUuids({ version, quantity: 37 })).toHaveLength(37);
        });
    }

    test("accepts the inclusive quantity boundaries", () => {
        expect(generateUuids({ version: 4, quantity: MIN_UUID_QUANTITY })).toHaveLength(1);
        expect(generateUuids({ version: 4, quantity: MAX_UUID_QUANTITY })).toHaveLength(
            MAX_UUID_QUANTITY,
        );
    });

    for (const quantity of [
        0,
        -1,
        MAX_UUID_QUANTITY + 1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
    ]) {
        test(`rejects a quantity of ${quantity}`, () => {
            expect(() => generateUuids({ version: 4, quantity })).toThrow(UuidQuantityError);
        });
    }

    test("reports the offending quantity on the thrown error", () => {
        try {
            generateUuids({ version: 4, quantity: 900 });
            throw new Error("expected generateUuids to throw");
        } catch (error) {
            expect(error).toBeInstanceOf(UuidQuantityError);
            expect((error as UuidQuantityError).quantity).toBe(900);
            expect((error as UuidQuantityError).code).toBe("invalid_quantity");
        }
    });

    test("never repeats a value inside one v4 batch", () => {
        const uuids = generateUuids({ version: 4, quantity: MAX_UUID_QUANTITY });

        expect(new Set(uuids).size).toBe(MAX_UUID_QUANTITY);
    });
});

describe("isValidQuantity", () => {
    for (const quantity of [1, 2, 250, 500]) {
        test(`accepts ${quantity}`, () => {
            expect(isValidQuantity(quantity)).toBe(true);
        });
    }

    for (const quantity of [0, -5, 501, 12.5, Number.NaN]) {
        test(`rejects ${quantity}`, () => {
            expect(isValidQuantity(quantity)).toBe(false);
        });
    }
});
