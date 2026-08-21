import { z } from "zod";

import { MAX_SHARED_TEXT_LENGTH } from "../domain/constants";
import {
    BULLET_MARKERS,
    CODE_BLOCK_STYLES,
    EMPHASIS_STYLES,
    HEADING_STYLES,
    HTML_MARKDOWN_MODES,
    LINK_STYLES,
} from "../types";

export const htmlMarkdownModeSchema = z.enum(HTML_MARKDOWN_MODES);

export const headingStyleSchema = z.enum(HEADING_STYLES);

export const bulletMarkerSchema = z.enum(BULLET_MARKERS);

export const codeBlockStyleSchema = z.enum(CODE_BLOCK_STYLES);

export const emphasisStyleSchema = z.enum(EMPHASIS_STYLES);

export const linkStyleSchema = z.enum(LINK_STYLES);

export const htmlMarkdownOptionsSchema = z.object({
    gfm: z.boolean(),
    headingStyle: headingStyleSchema,
    bulletMarker: bulletMarkerSchema,
    codeBlockStyle: codeBlockStyleSchema,
    emphasisStyle: emphasisStyleSchema,
    linkStyle: linkStyleSchema,
    keepUnsupportedHtml: z.boolean(),
    lineBreaks: z.boolean(),
    fullDocument: z.boolean(),
});

export type HtmlMarkdownOptionsInput = z.input<typeof htmlMarkdownOptionsSchema>;

/**
 * Search-param shape for `/tools/html-markdown?mode=markdownToHtml&text=%23+Hi`.
 * Each field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const htmlMarkdownSearchParamsSchema = z.object({
    mode: htmlMarkdownModeSchema.optional().catch(undefined),
    text: z.string().max(MAX_SHARED_TEXT_LENGTH).optional().catch(undefined),
    gfm: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional()
        .catch(undefined),
    headingStyle: headingStyleSchema.optional().catch(undefined),
    bulletMarker: bulletMarkerSchema.optional().catch(undefined),
    codeBlockStyle: codeBlockStyleSchema.optional().catch(undefined),
    linkStyle: linkStyleSchema.optional().catch(undefined),
});
