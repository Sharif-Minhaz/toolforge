import {
    HEADER_PARAMETERS,
    REGISTERED_CLAIMS,
    TIME_CLAIMS,
    type HeaderParameter,
    type HeaderRow,
    type JwtClaims,
    type PayloadRow,
    type RegisteredClaim,
    type TimeClaim,
    type TimeClaimInsight,
    type TimeClaimState,
} from "../types";
import { CLOCK_SKEW_SECONDS, JSON_INDENT, SECONDS_PER_DAY, STALE_IAT_DAYS } from "./constants";

const MILLISECONDS_PER_SECOND = 1000;

function toSeconds(instant: Date): number {
    return Math.floor(instant.getTime() / MILLISECONDS_PER_SECOND);
}

/** RFC 7519 §2: a NumericDate is a number of seconds, and may be fractional. */
function asNumericDate(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function classify(claim: TimeClaim, offsetSeconds: number): TimeClaimState {
    switch (claim) {
        case "exp":
            return offsetSeconds < -CLOCK_SKEW_SECONDS ? "expired" : "valid";
        case "nbf":
            return offsetSeconds > CLOCK_SKEW_SECONDS ? "notYetValid" : "valid";
        case "iat":
            if (offsetSeconds > CLOCK_SKEW_SECONDS) {
                return "future";
            }

            return offsetSeconds < -(STALE_IAT_DAYS * SECONDS_PER_DAY) ? "stale" : "valid";
    }
}

/**
 * Where one time claim stands against a reference instant. The instant is a
 * parameter, never `Date.now()`, so the server-rendered pass and every test
 * read the same clock.
 */
export function inspectTimeClaim(claim: TimeClaim, value: unknown, now: Date): TimeClaimInsight {
    const seconds = asNumericDate(value);

    if (seconds === null) {
        return { claim, value, at: null, state: "malformed", offsetSeconds: 0 };
    }

    const offsetSeconds = seconds - toSeconds(now);

    return {
        claim,
        value,
        at: new Date(seconds * MILLISECONDS_PER_SECOND),
        state: classify(claim, offsetSeconds),
        offsetSeconds,
    };
}

export function inspectTimeClaims(payload: JwtClaims, now: Date): readonly TimeClaimInsight[] {
    return TIME_CLAIMS.filter((claim) => claim in payload).map((claim) =>
        inspectTimeClaim(claim, payload[claim], now),
    );
}

function asHeaderParameter(name: string): HeaderParameter | null {
    return HEADER_PARAMETERS.find((parameter) => parameter === name) ?? null;
}

function asRegisteredClaim(name: string): RegisteredClaim | null {
    return REGISTERED_CLAIMS.find((claim) => claim === name) ?? null;
}

function asTimeClaim(name: string): TimeClaim | null {
    return TIME_CLAIMS.find((claim) => claim === name) ?? null;
}

export function buildHeaderRows(header: JwtClaims): readonly HeaderRow[] {
    return Object.entries(header).map(([name, value]) => ({
        name,
        value,
        parameter: asHeaderParameter(name),
    }));
}

export function buildPayloadRows(payload: JwtClaims, now: Date): readonly PayloadRow[] {
    return Object.entries(payload).map(([name, value]) => {
        const timeClaim = asTimeClaim(name);

        return {
            name,
            value,
            claim: asRegisteredClaim(name),
            time: timeClaim === null ? null : inspectTimeClaim(timeClaim, value, now),
        };
    });
}

/**
 * One claim rendered for a table cell. Strings stay unquoted so `sub` reads as
 * an identifier rather than JSON; everything else keeps its JSON shape so a
 * number and a numeric string remain distinguishable.
 */
export function formatClaimValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }

    if (value === undefined) {
        return "undefined";
    }

    return JSON.stringify(
        value,
        null,
        value !== null && typeof value === "object" ? JSON_INDENT : 0,
    );
}
