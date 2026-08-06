import { z } from "zod";

import { MAX_INPUT_LENGTH, MAX_PORT_SPEC_LENGTH } from "../domain/constants";
import { PORT_PRESETS } from "../types";

/**
 * The Server Action payload. Everything here arrives from a browser, so nothing
 * is trusted: the host is re-checked, re-resolved and re-guarded on the server
 * whatever the island already decided, and the token is verified before any of
 * it runs.
 */
export const scanRequestSchema = z.object({
    host: z.string().min(1).max(MAX_INPUT_LENGTH),
    preset: z.enum(PORT_PRESETS),
    // Bounded independently of the port ceiling: a megabyte of digits should be
    // refused before it is parsed, not after.
    ports: z.string().max(MAX_PORT_SPEC_LENGTH),
    turnstileToken: z.string().min(1).max(4_096),
});

export type ScanRequestPayload = z.infer<typeof scanRequestSchema>;

/**
 * Search-param shape for `/tools/port-scanner?host=example.com&preset=web`.
 * One `.catch(undefined)` per field, so a shared link carrying one bad value
 * opens on that field's default instead of throwing the page away.
 *
 * There is no `ports` param and that is deliberate: a link that arrives with a
 * host *and* a port list already filled in is a scan somebody else composed,
 * and this tool should never make that a single click.
 */
export const portScannerSearchParamsSchema = z.object({
    host: z.string().max(MAX_INPUT_LENGTH).optional().catch(undefined),
    preset: z.enum(PORT_PRESETS).optional().catch(undefined),
});
