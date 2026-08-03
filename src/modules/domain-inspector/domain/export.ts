import type { DownloadFile } from "@/modules/tools/types";
import type { DomainReport, PanelResult } from "../types";

/**
 * The whole report as one file.
 *
 * JSON, because this is a record somebody files: a migration checklist, a
 * ticket attachment, the "before" half of a DNS change. Prose would read
 * better once and diff worse forever.
 *
 * Failed panels are kept rather than dropped, carrying the reason they failed.
 * A report that silently omits the certificate section is indistinguishable
 * from one for a site that has no certificate.
 */

/** `example.com-20260804T101500Z.json` — sortable, and names its subject. */
export function buildReportFilename(hostname: string, generatedAt: Date): string {
    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    const cleaned = hostname.replace(/[^a-z0-9.-]/gi, "-").slice(0, 60);

    // A stem of nothing but separators is not a name; it just looks like one.
    const stem = /[a-z0-9]/i.test(cleaned) ? cleaned : "domain";

    return `${stem}-${stamp}.json`;
}

function serializePanel<T>(panel: PanelResult<T>): unknown {
    return panel.ok ? panel.data : { unavailable: panel.reason };
}

export function createDomainReportFile(report: DomainReport): DownloadFile {
    const payload = {
        checkedAt: report.checkedAt,
        domain: report.breakdown,
        dns: serializePanel(report.dns),
        registration: serializePanel(report.registration),
        hosting: serializePanel(report.hosting),
        certificate: serializePanel(report.certificate),
        http: serializePanel(report.http),
        technologies: serializePanel(report.technologies),
    };

    return {
        filename: buildReportFilename(report.breakdown.hostname, new Date(report.checkedAt)),
        mimeType: "application/json;charset=utf-8",
        content: `${JSON.stringify(payload, null, 2)}\n`,
    };
}

/** The short form people paste into a chat, not the file they archive. */
export function summarizeReport(report: DomainReport): string {
    const lines: string[] = [report.breakdown.hostname];

    if (report.dns.ok) {
        const addresses = report.dns.data.sets
            .filter((set) => set.type === "A" || set.type === "AAAA")
            .flatMap((set) => set.records.map((record) => record.value));

        if (addresses.length > 0) {
            lines.push(`A/AAAA: ${addresses.join(", ")}`);
        }
    }

    if (report.registration.ok) {
        const { registrar, expiresAt } = report.registration.data;

        if (registrar !== null) {
            lines.push(`Registrar: ${registrar}`);
        }

        if (expiresAt !== null) {
            lines.push(`Expires: ${expiresAt}`);
        }
    }

    if (report.hosting.ok) {
        const operators = [
            ...new Set(
                report.hosting.data
                    .map((address) => address.asName)
                    .filter((name): name is string => name !== null),
            ),
        ];

        if (operators.length > 0) {
            lines.push(`Network: ${operators.join(", ")}`);
        }
    }

    if (report.certificate.ok && report.certificate.data.validTo !== null) {
        lines.push(
            `Certificate: ${report.certificate.data.issuer ?? "unknown issuer"}, expires ${report.certificate.data.validTo}`,
        );
    }

    if (report.technologies.ok && report.technologies.data.length > 0) {
        lines.push(
            `Technologies: ${report.technologies.data.map((match) => match.name).join(", ")}`,
        );
    }

    return lines.join("\n");
}
