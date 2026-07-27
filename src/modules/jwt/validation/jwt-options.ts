import { z } from "zod";

import { JWT_ALGORITHMS, JWT_MODES } from "../types";

export const jwtModeSchema = z.enum(JWT_MODES);

export const jwtAlgorithmSchema = z.enum(JWT_ALGORITHMS);

/**
 * Search-param shape for `/tools/jwt?mode=encode&alg=RS256`. Each field catches
 * on its own so one malformed value degrades to the default instead of throwing
 * the whole page away.
 *
 * There is deliberately no `token` parameter. A JWT is a bearer credential: put
 * one in a URL and it lands in browser history, proxy and server access logs,
 * and the `Referer` header of every outbound link on the page. Tokens are typed
 * into the workbench and stay there.
 */
export const jwtSearchParamsSchema = z.object({
    mode: jwtModeSchema.optional().catch(undefined),
    alg: jwtAlgorithmSchema.optional().catch(undefined),
});

export type JwtSearchParams = z.infer<typeof jwtSearchParamsSchema>;
