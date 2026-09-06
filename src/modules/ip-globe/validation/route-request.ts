import { z } from "zod";

import { resolverSchema } from "@/modules/tools/validation/network";
import { MAX_HOSTNAME_LENGTH } from "@/modules/tools/domain/host-syntax";
import { MAX_INPUT_LENGTH } from "../domain/constants";
import { ROUTE_MODES } from "../types";

/**
 * The Server Action payload. Everything here arrives from a browser, so nothing
 * is trusted: the text is re-parsed and every address re-guarded on the server
 * whatever the island already decided.
 */
export const routeRequestSchema = z.object({
    // Bounded at the edge as well as in the parser: a megabyte of text should be
    // refused before it is split into lines, not after.
    input: z.string().min(1).max(MAX_INPUT_LENGTH),
    mode: z.enum(ROUTE_MODES),
    resolver: resolverSchema,
});

export type RouteRequestPayload = z.infer<typeof routeRequestSchema>;

export const routeModeSchema = z.enum(ROUTE_MODES);

/**
 * `/tools/ip-globe?host=example.com&resolver=google`. One `.catch(undefined)`
 * per field, so a shared link carrying one bad value opens on that field's
 * default instead of throwing the page away.
 *
 * `host` is a single name rather than the whole box, and there is no param for
 * a pasted trace. A link is a thing people forward, and a forwarded link that
 * silently fills forty hops in somebody else's browser is a lookup they did not
 * ask for — one host is an invitation, a whole route is an instruction.
 */
export const ipGlobeSearchParamsSchema = z.object({
    host: z.string().max(MAX_HOSTNAME_LENGTH).optional().catch(undefined),
    mode: routeModeSchema.optional().catch(undefined),
    resolver: resolverSchema.optional().catch(undefined),
});
