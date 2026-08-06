import { describe, expect, test } from "bun:test";

import {
    MOCK_RATE_LIMIT_PER_ADDRESS,
    MOCK_RATE_LIMIT_PER_SERVER,
    RATE_BUCKETS,
    rateLimitFor,
} from "@/modules/mock-server/domain/rate-limit";

/**
 * What is left here after the arithmetic moved to
 * `tools/domain/rate-window.ts`: the studio's own two ceilings, and the
 * relationship between them that makes the pair worth having at all.
 */
describe("rateLimitFor", () => {
    test("the server bound is looser than the per-address one", () => {
        // Otherwise the shared bound would refuse a team before the per-caller
        // one ever bit, and every legitimate group would hit the wrong message.
        expect(MOCK_RATE_LIMIT_PER_SERVER).toBeGreaterThan(MOCK_RATE_LIMIT_PER_ADDRESS);
    });

    test("names a limit for every bucket", () => {
        for (const bucket of RATE_BUCKETS) {
            expect(rateLimitFor(bucket)).toBeGreaterThan(0);
        }
    });
});
