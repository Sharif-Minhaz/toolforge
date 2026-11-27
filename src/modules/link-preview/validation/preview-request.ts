import { z } from "zod";

import { MAX_URL_LENGTH } from "../domain/constants";

/**
 * The one field the fetch mode takes, defined once and shared by the Server
 * Action and the MCP adapter, so a bound cannot be tightened in one entry point
 * and forgotten in the other.
 */
export const previewUrlSchema = z.string().trim().min(1).max(MAX_URL_LENGTH);

/** The two ways in: fetch a page, or read markup the reader pasted. */
export const PREVIEW_MODES = ["fetch", "paste"] as const;

export type PreviewMode = (typeof PREVIEW_MODES)[number];

export const previewModeSchema = z.enum(PREVIEW_MODES);

/** The Server Action payloads. Everything here arrives from a browser. */
export const inspectionRequestSchema = z.object({ url: previewUrlSchema });

export const imageProbeRequestSchema = z.object({ url: previewUrlSchema });

/**
 * `/tools/link-preview?url=https://example.com/&mode=fetch`.
 *
 * One `.catch(undefined)` per field, so one bad value opens on that field's
 * default instead of throwing the page away. The address only *prefills the
 * box*; it never runs the check. A link that fetched on arrival would let
 * anybody spend a stranger's allowance — and point this server at a host —
 * by getting them to open it.
 */
export const linkPreviewSearchParamsSchema = z.object({
    url: z.string().max(MAX_URL_LENGTH).optional().catch(undefined),
    mode: previewModeSchema.optional().catch(undefined),
});
