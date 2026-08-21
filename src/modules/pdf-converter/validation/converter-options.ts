import { z } from "zod";

import {
    MAX_PDF_FONT_SIZE,
    MAX_PDF_SHARED_TEXT_LENGTH,
    MIN_PDF_FONT_SIZE,
} from "../domain/constants";
import {
    PDF_MARGINS,
    PDF_ORIENTATIONS,
    PDF_PAGE_SIZES,
    PDF_PASTEABLE_FORMATS,
    PDF_SOURCE_FORMATS,
} from "../types";

export const pdfSourceFormatSchema = z.enum(PDF_SOURCE_FORMATS);

export const pdfPasteableFormatSchema = z.enum(PDF_PASTEABLE_FORMATS);

export const pdfPageSizeSchema = z.enum(PDF_PAGE_SIZES);

export const pdfOrientationSchema = z.enum(PDF_ORIENTATIONS);

export const pdfMarginSchema = z.enum(PDF_MARGINS);

/**
 * A whole number of points, bounded on both sides.
 *
 * Below seven a page stops being readable and above eighteen a paragraph stops
 * being one. Neither bound is a preference — they are the ends of the range in
 * which the rest of the layout's proportions still hold.
 */
export const pdfFontSizeSchema = z.number().int().min(MIN_PDF_FONT_SIZE).max(MAX_PDF_FONT_SIZE);

export const pdfConverterOptionsSchema = z.object({
    pageSize: pdfPageSizeSchema,
    orientation: pdfOrientationSchema,
    margin: pdfMarginSchema,
    fontSize: pdfFontSizeSchema,
    pageNumbers: z.boolean(),
    includeImages: z.boolean(),
    showLinkUrls: z.boolean(),
    includeSpeakerNotes: z.boolean(),
    repeatHeaderRow: z.boolean(),
    separateSheets: z.boolean(),
});

export type PdfConverterOptionsInput = z.input<typeof pdfConverterOptionsSchema>;

const booleanParam = z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .catch(undefined);

/**
 * Search-param shape for `/tools/pdf-converter?format=markdown&text=%23+Hi`.
 *
 * Each field catches on its own, so one malformed value degrades to a default
 * instead of throwing the whole page away. Only the pasteable formats can
 * arrive in a link: a `.docx` has no representation in a query string, and a
 * link claiming one would open on a picker with nothing in it.
 */
export const pdfConverterSearchParamsSchema = z.object({
    format: pdfPasteableFormatSchema.optional().catch(undefined),
    text: z.string().max(MAX_PDF_SHARED_TEXT_LENGTH).optional().catch(undefined),
    pageSize: pdfPageSizeSchema.optional().catch(undefined),
    orientation: pdfOrientationSchema.optional().catch(undefined),
    margin: pdfMarginSchema.optional().catch(undefined),
    fontSize: z.coerce.number().pipe(pdfFontSizeSchema).optional().catch(undefined),
    pageNumbers: booleanParam,
    includeImages: booleanParam,
    showLinkUrls: booleanParam,
});
