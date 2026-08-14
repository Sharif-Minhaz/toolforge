import { buildTimestampedFilename } from "@/modules/tools/domain/filenames";
import type { DownloadFile } from "@/modules/tools/types";
import type { EquationExportRequest } from "../types";

/** `.tex` rather than `.txt`: an editor that knows TeX should colour the file. */
const MIME_TYPE = "text/x-tex;charset=utf-8";

/** `toolforge-equations-20260814T101500Z.tex` — sortable and self-describing. */
export function buildEquationExportFilename(generatedAt: Date): string {
    return buildTimestampedFilename("equations", generatedAt, "tex");
}

/**
 * One `\[ … \]` per equation.
 *
 * `\[ \]` rather than `$$ $$`: the dollar form is deprecated in LaTeX proper and
 * amsmath's own documentation asks authors not to use it. A file somebody drops
 * into a document should not teach them the wrong habit.
 *
 * The source line each equation came from is written above it as a comment, so a
 * reader opening the file a week later can see what was typed as well as what
 * was generated — which is the whole "this is a suggestion" promise, kept in the
 * one artefact that outlives the page.
 */
export function createEquationExportFile(request: EquationExportRequest): DownloadFile {
    const body = request.equations
        .map((equation) => `% ${equation.source}\n\\[\n  ${equation.latex}\n\\]`)
        .join("\n\n");

    return {
        filename: buildEquationExportFilename(request.generatedAt),
        mimeType: MIME_TYPE,
        content: body.length === 0 ? "" : `${body}\n`,
    };
}
