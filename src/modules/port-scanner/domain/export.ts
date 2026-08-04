import type { DownloadFile } from "@/modules/tools/types";
import type { ScanReport } from "../types";

/**
 * A field is quoted when it could otherwise be misread, and a quote inside one
 * is doubled — RFC 4180. Service names here contain spaces but no commas, so
 * this rarely fires; it exists because "rarely" is not "never" and the next
 * name added to the table is not this file's problem.
 */
function csvField(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const CSV_HEADERS = ["port", "state", "service", "latency_ms"] as const;

export function buildScanCsv(report: ScanReport): string {
    const rows = report.results.map((result) =>
        [
            String(result.port),
            result.state,
            csvField(result.service ?? ""),
            result.latencyMs === null ? "" : String(result.latencyMs),
        ].join(","),
    );

    return [CSV_HEADERS.join(","), ...rows].join("\n");
}

/**
 * The whole report, including what was scanned and when.
 *
 * A bare list of ports is not evidence of anything a week later — which host,
 * which address it resolved to at the time, and when the scan ran are the
 * fields that make a saved result worth keeping.
 */
export function buildScanJson(report: ScanReport): string {
    return JSON.stringify(
        {
            hostname: report.hostname,
            address: report.address,
            ipVersion: report.version,
            startedAt: report.startedAt,
            durationMs: report.durationMs,
            summary: report.summary,
            results: report.results,
        },
        null,
        2,
    );
}

/** A filename that says what it holds without a timestamp nobody can read. */
function scanFilename(report: ScanReport, extension: string): string {
    const host = report.hostname.replaceAll(/[^a-z0-9.-]/gi, "-");
    const day = report.startedAt.slice(0, 10);

    return `port-scan-${host}-${day}.${extension}`;
}

export function createScanCsvFile(report: ScanReport): DownloadFile {
    return {
        filename: scanFilename(report, "csv"),
        mimeType: "text/csv;charset=utf-8",
        content: buildScanCsv(report),
    };
}

export function createScanJsonFile(report: ScanReport): DownloadFile {
    return {
        filename: scanFilename(report, "json"),
        mimeType: "application/json",
        content: buildScanJson(report),
    };
}
