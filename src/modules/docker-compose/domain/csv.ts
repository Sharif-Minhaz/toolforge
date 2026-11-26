/**
 * `--mount` and the long `--network` form are read by Go's `encoding/csv`, so
 * a value holding a comma is written `"source=/a,b"` and a quote inside one is
 * doubled. A plain split on commas reads those as two fields.
 */
export function splitCsv(value: string): string[] {
    const fields: string[] = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];

        if (char === '"') {
            if (quoted && value[index + 1] === '"') {
                field += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }

            continue;
        }

        if (char === "," && !quoted) {
            fields.push(field);
            field = "";
            continue;
        }

        field += char;
    }

    fields.push(field);

    return fields.filter((entry) => entry.length > 0);
}

export function joinCsv(fields: readonly string[]): string {
    return fields
        .map((field) => (/[",]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field))
        .join(",");
}
