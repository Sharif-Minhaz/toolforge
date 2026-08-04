import type { DomainReport, SecurityGrade } from "../types";

/**
 * The six readings the report leads with.
 *
 * Seven panels of detail with no summary is why the first version read as a
 * wall: nothing said which of them needed attention. This picks the one figure
 * per panel a person actually scans for and gives it a tone, so the strip at
 * the top of the report answers "is anything wrong here" before any panel is
 * read.
 *
 * Locale-free, like everything in `domain/`: a reading carries data and a
 * number, never a sentence. `text` is verbatim — a registrar, an AS name, a
 * grade key — and `amount` goes through `Intl` in the UI.
 */

export const READING_IDS = [
    "addresses",
    "network",
    "registrar",
    "expiry",
    "certificate",
    "headers",
] as const;

export type ReadingId = (typeof READING_IDS)[number];

export type ReadingTone = "good" | "warn" | "bad" | "idle";

export const READING_UNITS = ["days", "count"] as const;

export type ReadingUnit = (typeof READING_UNITS)[number];

export type Reading = {
    readonly id: ReadingId;
    readonly tone: ReadingTone;
    /** Verbatim data, or a literal key the UI resolves. `null` when unknown. */
    readonly text: string | null;
    /** A figure the UI formats; `null` when there is nothing to count. */
    readonly amount: number | null;
    readonly unit: ReadingUnit | null;
};

/** A month is the point at which a renewal stops being somebody else's problem. */
export const EXPIRY_WARN_DAYS = 30;

/**
 * Fifteen days, not thirty: a certificate on the 90-day Let's Encrypt cycle
 * renews at 30 by design, so warning there would cry wolf on healthy sites.
 */
export const CERTIFICATE_WARN_DAYS = 15;

const GRADE_TONES: Record<SecurityGrade, ReadingTone> = {
    strong: "good",
    partial: "warn",
    weak: "bad",
};

function daysTone(days: number | null, warnBelow: number): ReadingTone {
    if (days === null) {
        return "idle";
    }

    if (days < 0) {
        return "bad";
    }

    return days < warnBelow ? "warn" : "good";
}

function addressReading(report: DomainReport): Reading {
    const addresses = report.hosting.ok ? report.hosting.data : [];

    return {
        id: "addresses",
        tone: addresses.length > 0 ? "good" : "idle",
        text: addresses[0]?.ip ?? null,
        amount: addresses.length,
        unit: "count",
    };
}

function networkReading(report: DomainReport): Reading {
    const operator = report.hosting.ok
        ? (report.hosting.data.find((address) => address.asName !== null)?.asName ?? null)
        : null;

    return {
        id: "network",
        tone: operator === null ? "idle" : "good",
        text: operator,
        amount: null,
        unit: null,
    };
}

function registrarReading(report: DomainReport): Reading {
    const registrar = report.registration.ok ? report.registration.data.registrar : null;

    return {
        id: "registrar",
        tone: registrar === null ? "idle" : "good",
        text: registrar,
        amount: null,
        unit: null,
    };
}

function expiryReading(report: DomainReport): Reading {
    const days = report.registration.ok ? report.registration.data.daysUntilExpiry : null;

    return {
        id: "expiry",
        tone: daysTone(days, EXPIRY_WARN_DAYS),
        text: null,
        amount: days,
        unit: "days",
    };
}

function certificateReading(report: DomainReport): Reading {
    if (!report.certificate.ok) {
        return { id: "certificate", tone: "idle", text: null, amount: null, unit: null };
    }

    const { daysRemaining, expired, matchesHost } = report.certificate.data;

    // A certificate issued for another name is a failure however long it lasts,
    // so the name check outranks the countdown.
    const tone: ReadingTone =
        expired || !matchesHost ? "bad" : daysTone(daysRemaining, CERTIFICATE_WARN_DAYS);

    return { id: "certificate", tone, text: null, amount: daysRemaining, unit: "days" };
}

function headerReading(report: DomainReport): Reading {
    if (!report.http.ok) {
        return { id: "headers", tone: "idle", text: null, amount: null, unit: null };
    }

    const { grade } = report.http.data;

    return { id: "headers", tone: GRADE_TONES[grade], text: grade, amount: null, unit: null };
}

export function summarizeReadings(report: DomainReport): readonly Reading[] {
    return [
        addressReading(report),
        networkReading(report),
        registrarReading(report),
        expiryReading(report),
        certificateReading(report),
        headerReading(report),
    ];
}

/**
 * The worst tone in the strip, for the one-line verdict above it. `idle` never
 * wins: a panel that could not answer is not a finding.
 */
export function overallTone(readings: readonly Reading[]): ReadingTone {
    if (readings.some((reading) => reading.tone === "bad")) {
        return "bad";
    }

    if (readings.some((reading) => reading.tone === "warn")) {
        return "warn";
    }

    return readings.some((reading) => reading.tone === "good") ? "good" : "idle";
}
