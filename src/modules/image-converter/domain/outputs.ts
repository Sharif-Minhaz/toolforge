import { ARCHIVE_PATH_SEPARATOR } from "@/modules/tools/domain/archive";
import { toFilenameStem, uniqueFilenames } from "@/modules/tools/domain/filenames";

/**
 * One finished row, reduced to what the archive writer needs. A plain shape
 * rather than the result type, so the layout rule is testable without a Blob.
 */
export type ArchiveRow = {
    /** The source filename, before any cleaning. */
    readonly sourceName: string;
    readonly fileNames: readonly string[];
};

/**
 * Where every produced file lands inside the batch ZIP.
 *
 * One rule: a row that produced a single file stays at the root, and a row that
 * produced several gets a folder named after its source. That is what keeps a
 * mixed batch readable — five `favicon.ico` files flattened into one archive
 * would collide four times and arrive as `favicon-2.ico` through
 * `favicon-5.ico`, which tells nobody which picture each came from.
 *
 * The whole flat list still goes through `uniqueFilenames` afterwards, because
 * two sources can clean down to the same stem and therefore the same folder.
 */
export function buildArchivePaths(rows: readonly ArchiveRow[]): string[] {
    const paths = rows.flatMap((row) =>
        row.fileNames.map((name) =>
            row.fileNames.length > 1
                ? `${toFilenameStem(row.sourceName)}${ARCHIVE_PATH_SEPARATOR}${name}`
                : name,
        ),
    );

    return uniqueFilenames(paths);
}
