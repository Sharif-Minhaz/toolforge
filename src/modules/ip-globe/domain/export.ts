import type { DownloadFile } from "@/modules/tools/types";
import type { RouteReport } from "../types";

/**
 * A saved route.
 *
 * A bare list of dots is not evidence of anything a week later. Which hop, which
 * address it resolved to at the time, which network announced it and when the
 * lookup ran are the fields that make a downloaded route worth keeping — so both
 * formats carry the registry data, not just the coordinates.
 */

/**
 * A field is quoted when it could otherwise be misread, and a quote inside one
 * is doubled — RFC 4180. Operator names routinely contain commas, so unlike the
 * Port Scanner's this one fires constantly.
 */
function csvField(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const CSV_HEADERS = [
    "hop",
    "status",
    "host",
    "ip",
    "rtt_ms",
    "asn",
    "as_name",
    "country",
    "network",
    "org",
    "reverse",
] as const;

export function buildRouteCsv(report: RouteReport): string {
    const rows = report.hops.map((hop) =>
        [
            String(hop.index),
            hop.status,
            csvField(hop.hostname ?? ""),
            csvField(hop.ip ?? ""),
            hop.rttMs === null ? "" : String(hop.rttMs),
            hop.address?.asn === null || hop.address?.asn === undefined
                ? ""
                : String(hop.address.asn),
            csvField(hop.address?.asName ?? ""),
            csvField(hop.address?.country ?? ""),
            csvField(hop.address?.network ?? ""),
            csvField(hop.address?.org ?? ""),
            csvField(hop.address?.reverse ?? ""),
        ].join(","),
    );

    return [CSV_HEADERS.join(","), ...rows].join("\n");
}

export function buildRouteJson(report: RouteReport): string {
    return JSON.stringify(
        {
            mode: report.mode,
            checkedAt: report.checkedAt,
            summary: report.summary,
            hops: report.hops,
        },
        null,
        2,
    );
}

/** A filename that says what it holds without a timestamp nobody can read. */
function routeFilename(report: RouteReport, extension: string): string {
    const first = report.hops.find((hop) => hop.label.length > 0);
    const label = (first?.label ?? "route").replaceAll(/[^a-z0-9.-]/gi, "-");
    const day = report.checkedAt.slice(0, 10);

    return `ip-globe-${label}-${day}.${extension}`;
}

export function createRouteCsvFile(report: RouteReport): DownloadFile {
    return {
        filename: routeFilename(report, "csv"),
        mimeType: "text/csv;charset=utf-8",
        content: buildRouteCsv(report),
    };
}

export function createRouteJsonFile(report: RouteReport): DownloadFile {
    return {
        filename: routeFilename(report, "json"),
        mimeType: "application/json",
        content: buildRouteJson(report),
    };
}
