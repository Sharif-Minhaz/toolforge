import type { DocBlock, PdfTruncation, TableCell } from "../types";
import { plainRun } from "./blocks";
import { formatCellNumber, isDateFormat, isPercentFormat, serialToDateParts } from "./cell-format";
import { MAX_PDF_SHEET_COLUMNS, MAX_PDF_SHEET_ROWS, MAX_PDF_SHEETS } from "./constants";
import {
    attribute,
    childPath,
    childrenNamed,
    descendantsNamed,
    numericAttribute,
    readEntryXml,
    readRelationships,
    resolvePackagePath,
    type OoxmlPackage,
} from "./package";

/**
 * A workbook read straight out of its package.
 *
 * Implemented rather than depended on, which is the opposite call to the one
 * made for Word — and decision tree 45 is why. What comes out of here is read
 * by nobody but this tool's own renderer, and what has to be read *in* is
 * narrow: the sheet order, the shared string table, each cell's value, and just
 * enough of the style table to know a date from the number underneath it.
 *
 * The maintained alternative on the public registry is SheetJS, whose last
 * release there is `0.18.5` from 2022 — the project moved its distribution off
 * npm, so the package a lockfile would pin is a version its own authors no
 * longer ship. Decision tree 45 says to check who maintains it *before*
 * depending on it. Nobody maintains that one.
 */

export type XlsxReadResult = {
    readonly blocks: readonly DocBlock[];
    readonly title: string | null;
    readonly truncated: readonly PdfTruncation[];
    readonly empty: boolean;
};

export type XlsxReadOptions = {
    /** A heading naming each sheet, and a page break between them. */
    readonly separateSheets: boolean;
};

type SheetEntry = {
    readonly name: string;
    readonly path: string;
};

/* ----------------------------------------------------------------- lookup --- */

/**
 * `A1` split into a zero-based column and row.
 *
 * Needed because a sheet is sparse: `<row r="7">` after `<row r="2">` means
 * four empty rows, and `<c r="D1">` after `<c r="A1">` means two empty cells.
 * Reading positions from the reference rather than counting siblings is what
 * keeps a column of data under its own heading.
 */
export function parseCellReference(
    reference: string,
): { readonly column: number; readonly row: number } | null {
    const match = /^([A-Z]+)(\d+)$/.exec(reference.toUpperCase());

    if (match === null) {
        return null;
    }

    let column = 0;

    for (const letter of match[1]) {
        column = column * 26 + (letter.charCodeAt(0) - 64);
    }

    const row = Number.parseInt(match[2], 10);

    return { column: column - 1, row: row - 1 };
}

/**
 * The shared string table, flattened.
 *
 * An `<si>` is either one `<t>` or a sequence of `<r>` runs, and a run's marks
 * are formatting this tool does not carry into a table cell — a bold word in
 * the middle of a spreadsheet label is not what makes the cell readable.
 */
function readSharedStrings(pkg: OoxmlPackage): readonly string[] {
    const root = readEntryXml(pkg, "xl/sharedStrings.xml");

    if (root === null) {
        return [];
    }

    return childrenNamed(root, "si").map((item) =>
        descendantsNamed(item, "t")
            .map((node) => node.textContent ?? "")
            .join(""),
    );
}

type StyleTable = {
    /** Format id per cell-format index, as `<c s="…">` names it. */
    readonly formatIds: readonly number[];
    readonly customCodes: ReadonlyMap<number, string>;
};

function readStyles(pkg: OoxmlPackage): StyleTable {
    const root = readEntryXml(pkg, "xl/styles.xml");

    if (root === null) {
        return { formatIds: [], customCodes: new Map() };
    }

    const customCodes = new Map<number, string>();

    for (const format of descendantsNamed(root, "numFmt")) {
        const id = numericAttribute(format, "numFmtId");
        const code = attribute(format, "formatCode");

        if (id !== null && code !== null) {
            customCodes.set(id, code);
        }
    }

    const cellFormats = childrenNamed(root, "cellXfs")[0] ?? null;
    const formatIds =
        cellFormats === null
            ? []
            : childrenNamed(cellFormats, "xf").map(
                  (format) => numericAttribute(format, "numFmtId") ?? 0,
              );

    return { formatIds, customCodes };
}

function readSheetList(pkg: OoxmlPackage): readonly SheetEntry[] {
    const workbook = readEntryXml(pkg, "xl/workbook.xml");

    if (workbook === null) {
        return [];
    }

    const relationships = readRelationships(pkg, "xl/workbook.xml");
    const sheetsElement = childrenNamed(workbook, "sheets")[0] ?? null;
    const sheets: SheetEntry[] = [];

    for (const sheet of sheetsElement === null ? [] : childrenNamed(sheetsElement, "sheet")) {
        // A hidden sheet was hidden on purpose. Printing it would put working
        // notes into a document somebody is about to send to somebody else.
        const state = attribute(sheet, "state");

        if (state === "hidden" || state === "veryHidden") {
            continue;
        }

        const relationshipId = attribute(sheet, "r:id") ?? attribute(sheet, "id");
        const target =
            relationshipId === null ? null : (relationships.get(relationshipId)?.target ?? null);
        const path = target === null ? null : resolvePackagePath("xl/workbook.xml", target);

        if (path === null || !pkg.entries.has(path)) {
            continue;
        }

        sheets.push({ name: attribute(sheet, "name") ?? `Sheet ${sheets.length + 1}`, path });
    }

    return sheets;
}

function readsDate1904(pkg: OoxmlPackage): boolean {
    const workbook = readEntryXml(pkg, "xl/workbook.xml");
    const properties = workbook === null ? null : childPath(workbook, "workbookPr");
    const value = attribute(properties, "date1904");

    return value === "1" || value?.toLowerCase() === "true";
}

/* ------------------------------------------------------------------ cells --- */

type CellContext = {
    readonly sharedStrings: readonly string[];
    readonly styles: StyleTable;
    readonly date1904: boolean;
};

/**
 * One `<c>` as the string a reader should see.
 *
 * The `t` attribute names what is in `<v>`: a shared-string index, an inline
 * string, a boolean, an error, or — when it is absent, which is the common case
 * — a number. Only the number needs the style table, and only to answer the two
 * questions in `cell-format.ts`.
 */
export function readCellText(cell: Element, context: CellContext): string {
    const type = attribute(cell, "t") ?? "n";

    if (type === "inlineStr") {
        return descendantsNamed(cell, "t")
            .map((node) => node.textContent ?? "")
            .join("");
    }

    const value = childrenNamed(cell, "v")[0]?.textContent ?? "";

    if (value.length === 0) {
        return "";
    }

    if (type === "s") {
        const index = Number.parseInt(value, 10);

        return context.sharedStrings[index] ?? "";
    }

    if (type === "str") {
        return value;
    }

    if (type === "b") {
        return value === "1" ? "TRUE" : "FALSE";
    }

    if (type === "e") {
        // An error is the sheet's own answer — `#DIV/0!` — and printing it is
        // more useful than printing an empty cell where a number should be.
        return value;
    }

    if (type === "d") {
        return value;
    }

    return formatNumericCell(value, cell, context);
}

function formatNumericCell(value: string, cell: Element, context: CellContext): string {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return value;
    }

    const styleIndex = numericAttribute(cell, "s") ?? 0;
    const formatId = context.styles.formatIds[styleIndex] ?? 0;
    const formatCode = context.styles.customCodes.get(formatId) ?? null;

    if (isDateFormat(formatId, formatCode)) {
        const parts = serialToDateParts(numeric, context.date1904);

        if (parts !== null) {
            return parts.time === null ? parts.date : `${parts.date} ${parts.time}`;
        }
    }

    if (isPercentFormat(formatId, formatCode)) {
        return `${formatCellNumber(numeric * 100)}%`;
    }

    return formatCellNumber(numeric);
}

/* ---------------------------------------------------------------- merges --- */

type Merge = {
    readonly row: number;
    readonly column: number;
    readonly rowSpan: number;
    readonly colSpan: number;
};

function readMerges(sheet: Element): readonly Merge[] {
    const merges: Merge[] = [];

    for (const merge of descendantsNamed(sheet, "mergeCell")) {
        const reference = attribute(merge, "ref") ?? "";
        const [from, to] = reference.split(":");
        const start = from === undefined ? null : parseCellReference(from);
        const end = to === undefined ? null : parseCellReference(to);

        if (start === null || end === null) {
            continue;
        }

        merges.push({
            row: start.row,
            column: start.column,
            rowSpan: end.row - start.row + 1,
            colSpan: end.column - start.column + 1,
        });
    }

    return merges;
}

/* ----------------------------------------------------------------- sheets --- */

type SheetGrid = {
    readonly rows: readonly (readonly TableCell[])[];
    readonly truncated: readonly PdfTruncation[];
};

function readSheetGrid(sheetRoot: Element, context: CellContext): SheetGrid {
    const data = childrenNamed(sheetRoot, "sheetData")[0] ?? null;

    if (data === null) {
        return { rows: [], truncated: [] };
    }

    const merges = readMerges(sheetRoot);
    const spanAt = new Map<string, Merge>();
    const coveredCells = new Set<string>();

    for (const merge of merges) {
        spanAt.set(`${merge.row}:${merge.column}`, merge);

        for (let row = merge.row; row < merge.row + merge.rowSpan; row += 1) {
            for (let column = merge.column; column < merge.column + merge.colSpan; column += 1) {
                if (row !== merge.row || column !== merge.column) {
                    coveredCells.add(`${row}:${column}`);
                }
            }
        }
    }

    const byRow = new Map<number, Map<number, TableCell>>();
    let maxColumn = -1;
    let maxRow = -1;
    let totalRows = 0;

    for (const rowElement of childrenNamed(data, "row")) {
        totalRows += 1;

        const declared = numericAttribute(rowElement, "r");
        const rowIndex = declared === null ? totalRows - 1 : declared - 1;
        const cells = new Map<number, TableCell>();

        for (const cellElement of childrenNamed(rowElement, "c")) {
            const reference = attribute(cellElement, "r");
            const position = reference === null ? null : parseCellReference(reference);
            const columnIndex = position?.column ?? cells.size;
            const key = `${rowIndex}:${columnIndex}`;

            if (coveredCells.has(key)) {
                continue;
            }

            const text = readCellText(cellElement, context);
            const merge = spanAt.get(key);

            if (text.length === 0 && merge === undefined) {
                continue;
            }

            cells.set(columnIndex, {
                runs: [plainRun(text)],
                align: looksNumeric(text) ? "right" : "left",
                colSpan: merge === undefined || merge.colSpan < 2 ? undefined : merge.colSpan,
                rowSpan: merge === undefined || merge.rowSpan < 2 ? undefined : merge.rowSpan,
            });

            maxColumn = Math.max(maxColumn, columnIndex);
        }

        if (cells.size > 0) {
            byRow.set(rowIndex, cells);
            maxRow = Math.max(maxRow, rowIndex);
        }
    }

    if (maxRow < 0 || maxColumn < 0) {
        return { rows: [], truncated: [] };
    }

    const truncated: PdfTruncation[] = [];
    const keptRows = Math.min(maxRow + 1, MAX_PDF_SHEET_ROWS);
    const keptColumns = Math.min(maxColumn + 1, MAX_PDF_SHEET_COLUMNS);

    if (keptRows < maxRow + 1) {
        truncated.push({ kind: "rows", kept: keptRows, total: maxRow + 1 });
    }

    if (keptColumns < maxColumn + 1) {
        truncated.push({ kind: "columns", kept: keptColumns, total: maxColumn + 1 });
    }

    const rows: TableCell[][] = [];

    for (let rowIndex = 0; rowIndex < keptRows; rowIndex += 1) {
        const source = byRow.get(rowIndex);
        const row: TableCell[] = [];

        for (let columnIndex = 0; columnIndex < keptColumns; columnIndex += 1) {
            const cell = source?.get(columnIndex);

            row.push(clampSpans(cell, columnIndex, rowIndex, keptColumns, keptRows));
        }

        rows.push(row);
    }

    return { rows, truncated };
}

/**
 * A span that reached past a ceiling would point the renderer at cells that no
 * longer exist, which `pdfmake` turns into a table one column wider than its
 * own widths array. Clamped here, where both bounds are known.
 */
function clampSpans(
    cell: TableCell | undefined,
    column: number,
    row: number,
    columnCount: number,
    rowCount: number,
): TableCell {
    if (cell === undefined) {
        return { runs: [plainRun("")] };
    }

    const colSpan =
        cell.colSpan === undefined ? undefined : Math.min(cell.colSpan, columnCount - column);
    const rowSpan = cell.rowSpan === undefined ? undefined : Math.min(cell.rowSpan, rowCount - row);

    return {
        ...cell,
        colSpan: colSpan !== undefined && colSpan > 1 ? colSpan : undefined,
        rowSpan: rowSpan !== undefined && rowSpan > 1 ? rowSpan : undefined,
    };
}

/** Right-aligned when the whole cell is a number, a percentage or a date. */
function looksNumeric(text: string): boolean {
    return /^-?[\d.,]+%?$/.test(text) || /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(text);
}

/* -------------------------------------------------------------- the whole --- */

export function readXlsx(pkg: OoxmlPackage, options: XlsxReadOptions): XlsxReadResult | null {
    const sheets = readSheetList(pkg);

    if (sheets.length === 0) {
        return null;
    }

    const context: CellContext = {
        sharedStrings: readSharedStrings(pkg),
        styles: readStyles(pkg),
        date1904: readsDate1904(pkg),
    };

    const blocks: DocBlock[] = [];
    const truncated: PdfTruncation[] = [];
    const kept = sheets.slice(0, MAX_PDF_SHEETS);

    if (kept.length < sheets.length) {
        truncated.push({ kind: "sheets", kept: kept.length, total: sheets.length });
    }

    for (const sheet of kept) {
        const root = readEntryXml(pkg, sheet.path);

        if (root === null) {
            continue;
        }

        const grid = readSheetGrid(root, context);

        if (grid.rows.length === 0) {
            continue;
        }

        // The page break comes *before* the heading rather than after the last
        // table, so a workbook whose final sheet is empty does not end on a
        // blank page.
        if (options.separateSheets && blocks.length > 0) {
            blocks.push({ kind: "pageBreak" });
        }

        if (options.separateSheets) {
            blocks.push({ kind: "heading", level: 2, runs: [plainRun(sheet.name)] });
        }

        truncated.push(...grid.truncated.map((entry) => ({ ...entry, kind: entry.kind })));

        const [head, ...rest] = grid.rows;

        blocks.push({
            kind: "table",
            // A spreadsheet's first row is its header far more often than not,
            // and the cost of being wrong is one row drawn in bold. The cost of
            // not repeating it is a fifty-page table whose columns are unnamed
            // from page two onwards.
            head,
            rows: rest,
            caption: null,
        });
    }

    return {
        blocks,
        title: kept[0]?.name ?? null,
        truncated,
        empty: blocks.length === 0,
    };
}
