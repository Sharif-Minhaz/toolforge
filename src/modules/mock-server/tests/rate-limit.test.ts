import { describe, expect, test } from "bun:test";

import {
    decideRateLimit,
    MOCK_RATE_LIMIT_PER_ADDRESS,
    MOCK_RATE_LIMIT_PER_SERVER,
    MOCK_RATE_WINDOW_MS,
    RATE_BUCKETS,
    rateLimitFor,
    type RateSpend,
} from "@/modules/mock-server/domain/rate-limit";

const NOW = new Date("2026-08-05T12:00:30.000Z");
const WINDOW_START = new Date("2026-08-05T12:00:00.000Z");

function spend(bucket: RateSpend["bucket"], count: number, windowStart = WINDOW_START): RateSpend {
    return { bucket, count, windowStart };
}

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

describe("decideRateLimit", () => {
    test("allows a request well inside the limit", () => {
        const verdict = decideRateLimit([spend("address", 1)], NOW);

        expect(verdict.allowed).toBe(true);
        expect(verdict.remaining).toBe(MOCK_RATE_LIMIT_PER_ADDRESS - 1);
    });

    /**
     * The count already includes this request, so landing exactly on the limit
     * is the last allowed one. Getting this off by one either loses a request a
     * caller was promised or hands out one more than the limit says.
     */
    test("the request that lands exactly on the limit is allowed, with nothing left", () => {
        const verdict = decideRateLimit([spend("address", MOCK_RATE_LIMIT_PER_ADDRESS)], NOW);

        expect(verdict.allowed).toBe(true);
        expect(verdict.remaining).toBe(0);
    });

    test("the next one is refused", () => {
        const verdict = decideRateLimit([spend("address", MOCK_RATE_LIMIT_PER_ADDRESS + 1)], NOW);

        expect(verdict.allowed).toBe(false);
        expect(verdict.bucket).toBe("address");
        expect(verdict.remaining).toBe(0);
    });

    test("a runaway that has spent thousands is still just refused", () => {
        const verdict = decideRateLimit([spend("address", 250_000)], NOW);

        expect(verdict.allowed).toBe(false);
        expect(verdict.remaining).toBe(0);
    });

    describe("choosing which counter to report", () => {
        /** Reporting the roomier one would promise headroom the other will refuse. */
        test("reports the counter with the least headroom", () => {
            const verdict = decideRateLimit(
                [spend("address", MOCK_RATE_LIMIT_PER_ADDRESS - 1), spend("server", 3)],
                NOW,
            );

            expect(verdict.bucket).toBe("address");
            expect(verdict.remaining).toBe(1);
        });

        test("a refusal outranks an allowance whatever the headroom", () => {
            const verdict = decideRateLimit(
                [spend("address", 2), spend("server", MOCK_RATE_LIMIT_PER_SERVER + 1)],
                NOW,
            );

            expect(verdict.allowed).toBe(false);
            expect(verdict.bucket).toBe("server");
        });

        test("either counter alone can refuse", () => {
            const byAddress = decideRateLimit(
                [spend("address", MOCK_RATE_LIMIT_PER_ADDRESS + 1), spend("server", 1)],
                NOW,
            );

            expect(byAddress.allowed).toBe(false);
            expect(byAddress.bucket).toBe("address");
        });
    });

    describe("reset and retry", () => {
        test("resets one window after the window opened, in epoch seconds", () => {
            const verdict = decideRateLimit([spend("address", 1)], NOW);

            expect(verdict.resetsAt).toBe((WINDOW_START.getTime() + MOCK_RATE_WINDOW_MS) / 1_000);
        });

        test("retry-after counts from now, not from the window start", () => {
            // 30s into a 60s window.
            expect(decideRateLimit([spend("address", 1)], NOW).retryAfterSeconds).toBe(30);
        });

        /** A `Retry-After: 0` reads as "immediately" and invites a retry storm. */
        test("never returns zero, even on the last millisecond of the window", () => {
            const last = new Date(WINDOW_START.getTime() + MOCK_RATE_WINDOW_MS);

            expect(decideRateLimit([spend("address", 1)], last).retryAfterSeconds).toBe(1);
        });

        /** A row written by a host whose clock ran fast must not park a caller for longer. */
        test("never exceeds the window, whatever the row says", () => {
            const future = new Date(NOW.getTime() + 10 * MOCK_RATE_WINDOW_MS);
            const verdict = decideRateLimit([spend("address", 1, future)], NOW);

            expect(verdict.retryAfterSeconds).toBe(MOCK_RATE_WINDOW_MS / 1_000);
        });
    });

    /** The limiter failing open is the one outcome this must never produce silently. */
    test("no counters at all reports a full allowance rather than a refusal", () => {
        const verdict = decideRateLimit([], NOW);

        expect(verdict.allowed).toBe(true);
        expect(verdict.limit).toBe(MOCK_RATE_LIMIT_PER_ADDRESS);
        expect(verdict.remaining).toBe(MOCK_RATE_LIMIT_PER_ADDRESS);
    });

    /**
     * The window is short on purpose: the most likely cause of a flood here is a
     * render loop, and its author fixes it in seconds. An hourly window would
     * outlive the mistake by an hour.
     */
    test("the window is a minute, so a refusal clears within one", () => {
        expect(MOCK_RATE_WINDOW_MS).toBe(60_000);
    });
});
