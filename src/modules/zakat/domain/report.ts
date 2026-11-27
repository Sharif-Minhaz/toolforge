/**
 * The downloadable report, as plain text: a title, then sections of label and
 * value rows, aligned in two columns. Every string arrives already localised
 * and formatted — this only lays them out — so the same function serves both
 * catalogues and the test can pin the shape.
 */

export type ReportRow = readonly [label: string, value: string];

export type ReportSection = {
    readonly heading: string;
    readonly rows: readonly ReportRow[];
    /** Free lines under the rows: a caveat, a source. */
    readonly notes?: readonly string[];
};

export type ReportDocument = {
    readonly title: string;
    readonly subtitle: readonly string[];
    readonly sections: readonly ReportSection[];
    readonly footer: readonly string[];
};

/** Widest a label column grows before long labels simply push their value along. */
const MAX_LABEL_COLUMN = 44;

/** Code points, so a Bangla label lines up by letters rather than bytes. */
const width = (text: string) => [...text].length;

export function buildZakatReport(document: ReportDocument): string {
    const lines: string[] = [document.title, "=".repeat(Math.min(72, width(document.title)))];

    lines.push(...document.subtitle, "");

    for (const section of document.sections) {
        if (section.rows.length === 0 && (section.notes?.length ?? 0) === 0) {
            continue;
        }

        lines.push(section.heading, "-".repeat(Math.min(72, width(section.heading))));

        const column = Math.min(
            MAX_LABEL_COLUMN,
            Math.max(0, ...section.rows.map(([label]) => width(label))),
        );

        for (const [label, value] of section.rows) {
            const gap = Math.max(1, column - width(label) + 2);

            lines.push(`${label}${" ".repeat(gap)}${value}`);
        }

        for (const note of section.notes ?? []) {
            lines.push(`  ${note}`);
        }

        lines.push("");
    }

    lines.push(...document.footer);

    return `${lines.join("\n").trimEnd()}\n`;
}
