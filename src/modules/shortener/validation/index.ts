import { z } from "zod";

import { ALIAS_LENGTH, MAX_TARGET_URL_LENGTH } from "@/modules/short-links/domain/constants";
import { linkStateSchema } from "@/modules/short-links/validation";

/**
 * Search-param shape for `/tools/shortener?url=…&alias=…`.
 *
 * Each field catches on its own, so one malformed value opens the tool on a
 * default instead of throwing the whole page away. Nothing here is trusted: the
 * values only prefill a form that is validated again on the way to the server.
 */
export const shortenerSearchParamsSchema = z.object({
    url: z.string().max(MAX_TARGET_URL_LENGTH).optional().catch(undefined),
    alias: z
        .string()
        .max(ALIAS_LENGTH.max * 2)
        .optional()
        .catch(undefined),
    /** Set by the redirect route when a link had nowhere to send its visitor. */
    state: linkStateSchema,
});

export type ShortenerSearchParams = z.infer<typeof shortenerSearchParamsSchema>;
