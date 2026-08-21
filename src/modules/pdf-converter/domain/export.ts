import { toFilenameStem } from "@/modules/tools/domain/filenames";

/**
 * What the PDF is called.
 *
 * The source file's own name first, because that is what the reader will look
 * for in their downloads folder. A pasted document has no name, so its first
 * heading is used instead, and a document with neither falls back to a stamp
 * that at least sorts.
 *
 * Both names go through the same `toFilenameStem` every other tool here uses,
 * rather than a second cleaner written for this one. It keeps Unicode — a
 * document titled in Bangla comes back with its own name — and replaces only
 * what would change where the file lands.
 */

/** Long enough for a real heading, short of what a mail client truncates. */
const MAX_FILENAME_STEM = 72;

export function buildPdfFilename(
    sourceFilename: string | null,
    documentTitle: string | null,
    generatedAt: Date,
): string {
    for (const candidate of [sourceFilename, documentTitle]) {
        if (candidate === null || candidate.trim().length === 0) {
            continue;
        }

        // A heading is not a filename and has no extension to strip, but
        // `toFilenameStem` only removes a trailing dotted suffix — so "Release
        // notes" survives whole and "report.docx" loses exactly its extension.
        const stem = toFilenameStem(candidate)
            .slice(0, MAX_FILENAME_STEM)
            .replace(/[.-]+$/, "");

        if (stem.length > 0) {
            return `${stem}.pdf`;
        }
    }

    const stamp = generatedAt
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    return `document-${stamp}.pdf`;
}
