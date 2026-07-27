import { describe, expect, test } from "bun:test";

import {
    buildHeaderRows,
    buildPayloadRows,
    formatClaimValue,
    inspectTimeClaim,
    inspectTimeClaims,
} from "@/modules/jwt/domain/claims";
import {
    CLOCK_SKEW_SECONDS,
    SECONDS_PER_DAY,
    STALE_IAT_DAYS,
} from "@/modules/jwt/domain/constants";
import type { TimeClaim, TimeClaimState } from "@/modules/jwt/types";

/** A fixed instant, so nothing here depends on when the suite runs. */
const NOW = new Date("2026-07-27T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

function stateOf(claim: TimeClaim, offsetSeconds: number): TimeClaimState {
    return inspectTimeClaim(claim, NOW_SECONDS + offsetSeconds, NOW).state;
}

describe("inspectTimeClaim", () => {
    test("converts seconds since the epoch to an instant", () => {
        const insight = inspectTimeClaim("iat", 1516239022, NOW);

        expect(insight.at?.toISOString()).toBe("2018-01-18T01:30:22.000Z");
    });

    test("reports the signed distance from the reference instant", () => {
        expect(inspectTimeClaim("exp", NOW_SECONDS + 300, NOW).offsetSeconds).toBe(300);
        expect(inspectTimeClaim("exp", NOW_SECONDS - 300, NOW).offsetSeconds).toBe(-300);
    });

    test("allows clock skew on both sides of exp", () => {
        expect(stateOf("exp", -CLOCK_SKEW_SECONDS)).toBe("valid");
        expect(stateOf("exp", -CLOCK_SKEW_SECONDS - 1)).toBe("expired");
    });

    test("allows clock skew on nbf", () => {
        expect(stateOf("nbf", CLOCK_SKEW_SECONDS)).toBe("valid");
        expect(stateOf("nbf", CLOCK_SKEW_SECONDS + 1)).toBe("notYetValid");
    });

    test("flags an iat from the future", () => {
        expect(stateOf("iat", CLOCK_SKEW_SECONDS)).toBe("valid");
        expect(stateOf("iat", CLOCK_SKEW_SECONDS + 1)).toBe("future");
    });

    test("flags an iat past the stale threshold", () => {
        const threshold = STALE_IAT_DAYS * SECONDS_PER_DAY;

        expect(stateOf("iat", -threshold)).toBe("valid");
        expect(stateOf("iat", -threshold - 1)).toBe("stale");
    });

    test("reports a value that is not a NumericDate", () => {
        for (const value of ["1516239022", null, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
            const insight = inspectTimeClaim("exp", value, NOW);

            expect(insight.state).toBe("malformed");
            expect(insight.at).toBeNull();
        }
    });

    test("accepts a fractional NumericDate, as RFC 7519 allows", () => {
        expect(inspectTimeClaim("exp", NOW_SECONDS + 0.5, NOW).state).toBe("valid");
    });
});

describe("inspectTimeClaims", () => {
    test("covers only the time claims actually present", () => {
        const insights = inspectTimeClaims({ iat: NOW_SECONDS, sub: "1" }, NOW);

        expect(insights.map((insight) => insight.claim)).toEqual(["iat"]);
    });

    test("keeps a claim that is present but unusable", () => {
        const insights = inspectTimeClaims({ exp: "soon" }, NOW);

        expect(insights).toHaveLength(1);
        expect(insights[0]?.state).toBe("malformed");
    });

    test("returns nothing for a payload with no time claims", () => {
        expect(inspectTimeClaims({ sub: "1" }, NOW)).toEqual([]);
    });
});

describe("buildHeaderRows", () => {
    test("marks documented parameters and leaves the rest unlabelled", () => {
        const rows = buildHeaderRows({ alg: "HS256", kid: "abc", vendor: "acme" });

        expect(rows.map((row) => row.parameter)).toEqual(["alg", "kid", null]);
    });

    test("preserves the order the header was written in", () => {
        expect(buildHeaderRows({ typ: "JWT", alg: "HS256" }).map((row) => row.name)).toEqual([
            "typ",
            "alg",
        ]);
    });
});

describe("buildPayloadRows", () => {
    test("labels registered claims and attaches time standing", () => {
        const rows = buildPayloadRows({ sub: "1", exp: NOW_SECONDS - 600, role: "admin" }, NOW);

        expect(rows.map((row) => row.claim)).toEqual(["sub", "exp", null]);
        expect(rows[0]?.time).toBeNull();
        expect(rows[1]?.time?.state).toBe("expired");
    });
});

describe("formatClaimValue", () => {
    test("leaves strings unquoted so identifiers read plainly", () => {
        expect(formatClaimValue("1234567890")).toBe("1234567890");
    });

    test("keeps a number distinguishable from a numeric string", () => {
        expect(formatClaimValue(1234567890)).toBe("1234567890");
        expect(formatClaimValue(true)).toBe("true");
        expect(formatClaimValue(null)).toBe("null");
    });

    test("indents nested structures", () => {
        expect(formatClaimValue({ a: 1 })).toBe('{\n  "a": 1\n}');
        expect(formatClaimValue(["a", "b"])).toBe('[\n  "a",\n  "b"\n]');
    });

    test("names an absent value rather than returning nothing", () => {
        expect(formatClaimValue(undefined)).toBe("undefined");
    });
});
