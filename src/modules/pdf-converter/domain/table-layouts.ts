import type { CustomTableLayout } from "pdfmake/interfaces";

import { CODE_LAYOUT, PDF_INK, TABLE_LAYOUT } from "./render";

/**
 * The two table layouts the definitions name.
 *
 * Registered with the engine by name rather than inlined into the document,
 * for one reason: a layout is a bag of *functions*, and a document definition
 * carrying functions is no longer data. Keeping them here leaves
 * `buildDocDefinition` returning a plain object that a test can assert against
 * field by field.
 *
 * Both callers — the browser engine and the MCP adapter — register the same
 * object, so a table looks the same whoever asked for it.
 */
export function createTableLayouts(): Record<string, CustomTableLayout> {
    return {
        [TABLE_LAYOUT]: {
            hLineWidth: (index, node) =>
                index === 0 || index === node.table.body.length ? 0.8 : 0.5,
            vLineWidth: () => 0,
            hLineColor: () => PDF_INK.tableBorder,
            // Horizontal rules only, and a tinted every-other row. Vertical
            // lines make a table look like a spreadsheet, which is exactly what
            // a spreadsheet no longer is once it is a page of a report.
            fillColor: (rowIndex, node) => {
                const headerRows = node.table.headerRows ?? 0;

                if (rowIndex < headerRows) {
                    return PDF_INK.tableHeaderBackground;
                }

                return (rowIndex - headerRows) % 2 === 1 ? PDF_INK.tableStripe : null;
            },
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
        },
        [CODE_LAYOUT]: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => PDF_INK.codeBackground,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 8,
            paddingBottom: () => 8,
        },
    };
}
