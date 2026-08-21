import type { PdfFontFamily } from "../types";
import { PDF_FONT_PACKS } from "./constants";

/**
 * What has to be loaded, and what has to be declared, for a given document.
 *
 * Two callers register fonts with the engine — the browser, which fetches a
 * pack over HTTP, and the MCP adapter, which reads it off disk. Neither of
 * those is this layer's business, and both need exactly the same two answers,
 * so the answers live here and the bytes are somebody else's problem.
 */

export type FontDeclaration = {
    readonly normal: string;
    readonly bold: string;
    readonly italics: string;
    readonly bolditalics: string;
};

/**
 * The `fonts` table pdfmake wants, for these families and no others.
 *
 * Declaring a family whose files are not in the virtual file system is not a
 * warning — pdfkit throws the moment a run asks for it. So the table is built
 * from what the document actually needs rather than from everything that
 * exists, and the same list drives the fetch.
 */
export function buildFontDeclarations(
    families: readonly PdfFontFamily[],
): Record<string, FontDeclaration> {
    const declarations: Record<string, FontDeclaration> = {};

    // Roboto is always declared. It is already in the bundle, it costs nothing,
    // and it is the family every fallback resolves to — including the one for a
    // script no pack can draw, which still has to be *drawable as blanks*
    // rather than fatal.
    for (const family of new Set<PdfFontFamily>(["Roboto", ...families])) {
        const pack = PDF_FONT_PACKS[family];

        declarations[family] = {
            normal: pack.normal,
            bold: pack.bold,
            italics: pack.italics,
            bolditalics: pack.bolditalics,
        };
    }

    return declarations;
}

/** The families whose files are not already inside pdfmake, deduplicated. */
export function packsToLoad(families: readonly PdfFontFamily[]): readonly PdfFontFamily[] {
    return [...new Set(families)].filter((family) => !PDF_FONT_PACKS[family].bundled);
}

/** Every distinct file one pack is made of. */
export function packFiles(family: PdfFontFamily): readonly string[] {
    const pack = PDF_FONT_PACKS[family];

    return [...new Set([pack.normal, pack.bold, pack.italics, pack.bolditalics])];
}
