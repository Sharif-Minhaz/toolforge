import { z } from "zod";

import { MAX_INPUT_LENGTH, MCP_DEFAULT_LIMIT, MCP_MAX_LIMIT } from "../domain/constants";
import { SUBDOMAIN_SORTS } from "../types";

/**
 * The one field this tool takes, defined once.
 *
 * Shared by the Server Action payload and the MCP adapter, so a bound cannot be
 * tightened in one entry point and forgotten in the other.
 */
export const apexInputSchema = z.string().min(1).max(MAX_INPUT_LENGTH);

export const subdomainSortSchema = z.enum(SUBDOMAIN_SORTS);

/** How many names one MCP call may carry back. See `MCP_DEFAULT_LIMIT`. */
export const resultLimitSchema = z
    .number()
    .int()
    .min(1)
    .max(MCP_MAX_LIMIT)
    .default(MCP_DEFAULT_LIMIT);

/**
 * The Server Action payload.
 *
 * Everything here arrives from a browser, so nothing is trusted: the apex is
 * re-read and re-narrowed on the server whatever the island already decided,
 * and the quota is spent on the server's reading of it rather than the
 * client's.
 */
export const lookupRequestSchema = z.object({
    apex: apexInputSchema,
});

export type LookupRequestPayload = z.infer<typeof lookupRequestSchema>;

/**
 * Search-param shape for `/tools/subdomain-lookup?apex=example.com&sort=newest`.
 *
 * One `.catch(undefined)` per field, so a shared link carrying one bad value
 * opens on that field's default instead of throwing the page away.
 *
 * The apex only *prefills the box*; it never runs the lookup. A link that
 * queried on arrival would let anybody spend a stranger's allowance — and this
 * deployment's share of the upstream's — by getting them to open a URL.
 */
export const subdomainLookupSearchParamsSchema = z.object({
    apex: z.string().max(MAX_INPUT_LENGTH).optional().catch(undefined),
    sort: subdomainSortSchema.optional().catch(undefined),
});
