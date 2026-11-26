import { z } from "zod";

import { DEFAULT_OPTIONS, HEX_COLOR_PATTERN, MAX_TEXT_LENGTH } from "../domain/constants";
import type { FaviconOptions } from "../types";

const hexColorSchema = z
    .string()
    .regex(HEX_COLOR_PATTERN)
    .transform((value) => value.toLowerCase());

/**
 * `/tools/favicon-generator?text=TF&fg=%23ffffff&bg=%23111827`. Each field
 * catches on its own, so one malformed value opens on its default instead of
 * throwing the page away.
 */
export const faviconSearchParamsSchema = z.object({
    text: z.string().trim().min(1).max(MAX_TEXT_LENGTH).optional().catch(undefined),
    fg: hexColorSchema.optional().catch(undefined),
    bg: hexColorSchema.optional().catch(undefined),
});

export function initialOptionsFrom(searchParams: unknown): FaviconOptions {
    const parsed = faviconSearchParamsSchema.safeParse(searchParams);
    const named = parsed.success ? parsed.data : undefined;

    return {
        ...DEFAULT_OPTIONS,
        text: named?.text ?? DEFAULT_OPTIONS.text,
        foreground: named?.fg ?? DEFAULT_OPTIONS.foreground,
        background: named?.bg ?? DEFAULT_OPTIONS.background,
    };
}
