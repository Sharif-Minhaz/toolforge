import { describe, expect, test } from "bun:test";

import {
    decideRateLimit,
    RATE_WINDOW_MS,
    type RateSpend,
} from "@/modules/tools/domain/rate-window";

const NOW = new Date("2026-08-05T12:00:30.000Z");
const WINDOW_START = new Date("2026-08-05T12:00:00.000Z");

/**
 * Limits of this file's own, not either studio's. The arithmetic here is what
 * is under test; a tool's ceilings are its own to name, and importing them
 * would make a shared test fail whenever somebody retuned one.
 */
type Bucket = "address" | "server";

const PER_ADDRESS = 120;
const PER_SERVER = 1_200;

const FALLBACK = { bucket: "address", limit: PER_ADDRESS } as const;

function spend(bucket: Bucket, count: number, windowStart = WINDOW_START): RateSpend<Bucket> {
    return { bucket, limit: bucket === "address" ? PER_ADDRESS : PER_SERVER, count, windowStart };
}

describe("decideRateLimit", () => {
    test("allows a request well inside the limit", () => {
        const verdict = decideRateLimit([spend("address", 1)], NOW, FALLBACK);

        expect(verdict.allowed).toBe(true);
        expect(verdict.remaining).toBe(PER_ADDRESS - 1);
    });

    /**
     * The count already includes this request, so landing exactly on the limit
     * is the last allowed one. Getting this off by one either loses a request a
     * caller was promised or hands out one more than the limit says.
     */
    test("the request that lands exactly on the limit is allowed, with nothing left", () => {
        const verdict = decideRateLimit([spend("address", PER_ADDRESS)], NOW, FALLBACK);

        expect(verdict.allowed).toBe(true);
        expect(verdict.remaining).toBe(0);
    });

    test("the next one is refused", () => {
        const verdict = decideRateLimit([spend("address", PER_ADDRESS + 1)], NOW, FALLBACK);

        expect(verdict.allowed).toBe(false);
        expect(verdict.bucket).toBe("address");
        expect(verdict.remaining).toBe(0);
    });

    test("a runaway that has spent thousands is still just refused", () => {
        const verdict = decideRateLimit([spend("address", 250_000)], NOW, FALLBACK);

        expect(verdict.allowed).toBe(false);
        expect(verdict.remaining).toBe(0);
    });

    /**
     * Each counter carries its own ceiling, so two buckets with different
     * limits are compared on headroom rather than on raw count. This is the
     * property that lets one caller share the arithmetic with another whose
     * numbers are nothing like it.
     */
    test("reads each counter against its own limit, not a shared one", () => {
        const verdict = decideRateLimit([spend("address", 10), spend("server", 10)], NOW, FALLBACK);

        expect(verdict.bucket).toBe("address");
        expect(verdict.remaining).toBe(PER_ADDRESS - 10);
    });

    describe("choosing which counter to report", () => {
        /** Reporting the roomier one would promise headroom the other will refuse. */
        test("reports the counter with the least headroom", () => {
            const verdict = decideRateLimit(
                [spend("address", PER_ADDRESS - 1), spend("server", 3)],
                NOW,
                FALLBACK,
            );

            expect(verdict.bucket).toBe("address");
            expect(verdict.remaining).toBe(1);
        });

        test("a refusal outranks an allowance whatever the headroom", () => {
            const verdict = decideRateLimit(
                [spend("address", 2), spend("server", PER_SERVER + 1)],
                NOW,
                FALLBACK,
            );

            expect(verdict.allowed).toBe(false);
            expect(verdict.bucket).toBe("server");
        });

        test("either counter alone can refuse", () => {
            const byAddress = decideRateLimit(
                [spend("address", PER_ADDRESS + 1), spend("server", 1)],
                NOW,
                FALLBACK,
            );

            expect(byAddress.allowed).toBe(false);
            expect(byAddress.bucket).toBe("address");
        });
    });

    describe("reset and retry", () => {
        test("resets one window after the window opened, in epoch seconds", () => {
            const verdict = decideRateLimit([spend("address", 1)], NOW, FALLBACK);

            expect(verdict.resetsAt).toBe((WINDOW_START.getTime() + RATE_WINDOW_MS) / 1_000);
        });

        test("retry-after counts from now, not from the window start", () => {
            // 30s into a 60s window.
            expect(decideRateLimit([spend("address", 1)], NOW, FALLBACK).retryAfterSeconds).toBe(
                30,
            );
        });

        /** A `Retry-After: 0` reads as "immediately" and invites a retry storm. */
        test("never returns zero, even on the last millisecond of the window", () => {
            const last = new Date(WINDOW_START.getTime() + RATE_WINDOW_MS);

            expect(decideRateLimit([spend("address", 1)], last, FALLBACK).retryAfterSeconds).toBe(
                1,
            );
        });

        /** A row written by a host whose clock ran fast must not park a caller for longer. */
        test("never exceeds the window, whatever the row says", () => {
            const future = new Date(NOW.getTime() + 10 * RATE_WINDOW_MS);
            const verdict = decideRateLimit([spend("address", 1, future)], NOW, FALLBACK);

            expect(verdict.retryAfterSeconds).toBe(RATE_WINDOW_MS / 1_000);
        });

        /** A caller passing its own window gets its own reset, not the default. */
        test("honours a window passed in", () => {
            const tenMinutes = 10 * 60 * 1_000;
            const verdict = decideRateLimit([spend("address", 1)], NOW, FALLBACK, tenMinutes);

            expect(verdict.resetsAt).toBe((WINDOW_START.getTime() + tenMinutes) / 1_000);
        });
    });

    /** The limiter failing open is the one outcome this must never produce silently. */
    test("no counters at all reports a full allowance rather than a refusal", () => {
        const verdict = decideRateLimit<Bucket>([], NOW, FALLBACK);

        expect(verdict.allowed).toBe(true);
        expect(verdict.limit).toBe(PER_ADDRESS);
        expect(verdict.remaining).toBe(PER_ADDRESS);
    });

    /**
     * The window is short on purpose: the most likely cause of a flood here is a
     * render loop, and its author fixes it in seconds. An hourly window would
     * outlive the mistake by an hour.
     */
    test("the default window is a minute, so a refusal clears within one", () => {
        expect(RATE_WINDOW_MS).toBe(60_000);
    });
});
