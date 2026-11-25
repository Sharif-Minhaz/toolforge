import { describe, expect, test } from "bun:test";

import { classifyUpstreamFailure } from "../domain/upstream-failure";

/** The body the live worker answered with on 2026-11-25, verbatim. */
const SPENT_DAY =
    "AiError: 4006: you have used up your daily free allocation of 10,000 neurons, " +
    "please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.";

describe("classifyUpstreamFailure", () => {
    test("names a spent daily allowance, whichever status carries it", () => {
        expect(classifyUpstreamFailure(500, SPENT_DAY)).toBe("quota_exhausted");
        expect(classifyUpstreamFailure(429, SPENT_DAY)).toBe("quota_exhausted");
        expect(classifyUpstreamFailure(500, "AiError: 3036: Account limited")).toBe(
            "quota_exhausted",
        );
    });

    test("leaves every other model error an outage", () => {
        expect(classifyUpstreamFailure(500, "AiError: 5028: model was deprecated")).toBe(
            "upstream_unavailable",
        );
        expect(classifyUpstreamFailure(500, "Error: Model returned no image")).toBe(
            "upstream_unavailable",
        );
        expect(classifyUpstreamFailure(502, "")).toBe("upstream_unavailable");
    });

    test("does not mistake a bare number for the code", () => {
        expect(classifyUpstreamFailure(500, "Error: read 4006 bytes")).toBe("upstream_unavailable");
    });

    test("keeps the worker's per-minute limit its own refusal", () => {
        expect(classifyUpstreamFailure(429, "Rate limit exceeded")).toBe("rate_limited");
    });

    test("maps the remaining statuses", () => {
        expect(classifyUpstreamFailure(401, "Unauthorized")).toBe("unauthorized");
        expect(classifyUpstreamFailure(403, "")).toBe("unauthorized");
        expect(classifyUpstreamFailure(413, "")).toBe("too_large");
        expect(classifyUpstreamFailure(415, "")).toBe("unsupported_type");
        expect(classifyUpstreamFailure(400, "Missing image or mask")).toBe("invalid_request");
    });
});
