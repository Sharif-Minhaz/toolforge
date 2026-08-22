import type { DownloadFile } from "@/modules/tools/types";
import type { SubdomainRecord, SubdomainReport } from "../types";

/**
 * What leaves the page.
 *
 * Every builder takes the record list separately from the report, because what
 * is worth saving is what the reader is looking at — the filter and the order
 * they chose — while the header fields describing *which* lookup produced it
 * come from the report. Paging never enters into it: a page is a rendering
 * decision, and a download that stopped at a hundred names would be the one
 * place this tool quietly lost data.
 */

/** RFC 4180: quote a field that could be misread, and double a quote inside it. */
function csvField(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const CSV_HEADERS = ["subdomain", "label", "depth", "first_seen"] as const;

/**
 * The plainest form, and the one most likely to be piped into something else.
 *
 * One name per line and nothing else — no header, no count, no commentary —
 * because the moment this file has a preamble it stops being usable as the
 * input to `dig`, `httpx` or a `for` loop, which is most of why anyone wants it.
 */
export function buildSubdomainText(records: readonly SubdomainRecord[]): string {
    return records.map((record) => record.name).join("\n");
}

export function buildSubdomainCsv(records: readonly SubdomainRecord[]): string {
    const rows = records.map((record) =>
        [
            csvField(record.name),
            csvField(record.label ?? ""),
            String(record.depth),
            record.firstSeen ?? "",
        ].join(","),
    );

    return [CSV_HEADERS.join(","), ...rows].join("\n");
}

/**
 * The whole answer, including what was asked and when.
 *
 * A bare list of names is not evidence of anything a month later. Which apex,
 * when the index was read, whether the record cap bit, and how many names the
 * index actually held are the fields that make a saved result worth keeping —
 * `truncated` most of all, since a file that silently held a prefix of the
 * truth is worse than no file.
 */
export function buildSubdomainJson(
    report: SubdomainReport,
    records: readonly SubdomainRecord[],
): string {
    return JSON.stringify(
        {
            apex: report.apex,
            narrowedFrom: report.narrowedFrom,
            source: "crt.name",
            fetchedAt: report.fetchedAt,
            summary: report.summary,
            exported: records.length,
            records,
        },
        null,
        2,
    );
}

/** A filename that says what it holds without a timestamp nobody can read. */
function exportFilename(report: SubdomainReport, extension: string): string {
    const apex = report.apex.replaceAll(/[^a-z0-9.-]/gi, "-");
    const day = report.fetchedAt.slice(0, 10);

    return `subdomains-${apex}-${day}.${extension}`;
}

export function createSubdomainTextFile(
    report: SubdomainReport,
    records: readonly SubdomainRecord[],
): DownloadFile {
    return {
        filename: exportFilename(report, "txt"),
        mimeType: "text/plain;charset=utf-8",
        content: buildSubdomainText(records),
    };
}

export function createSubdomainCsvFile(
    report: SubdomainReport,
    records: readonly SubdomainRecord[],
): DownloadFile {
    return {
        filename: exportFilename(report, "csv"),
        mimeType: "text/csv;charset=utf-8",
        content: buildSubdomainCsv(records),
    };
}

export function createSubdomainJsonFile(
    report: SubdomainReport,
    records: readonly SubdomainRecord[],
): DownloadFile {
    return {
        filename: exportFilename(report, "json"),
        mimeType: "application/json",
        content: buildSubdomainJson(report, records),
    };
}
