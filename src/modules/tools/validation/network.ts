import { z } from "zod";

import { DNS_RESOLVERS } from "../types/network";

/**
 * What a resolver and a registry are allowed to have said.
 *
 * Both are read loosely on purpose. These parse answers from services nobody
 * here operates, and the failure mode that matters is a strict schema turning a
 * partial-but-useful answer into no answer at all.
 */

export const resolverSchema = z.enum(DNS_RESOLVERS);

/**
 * The DoH JSON answer, per the `application/dns-json` shape Cloudflare, Google
 * and dns.sb all serve. `Answer` is absent — not empty — when there is nothing
 * to return, which is why it is optional rather than defaulted at the edge.
 */
export const dohResponseSchema = z.object({
    Status: z.number(),
    AD: z.boolean().optional(),
    Answer: z
        .array(
            z.object({
                name: z.string(),
                type: z.number(),
                TTL: z.number().optional().default(0),
                data: z.string(),
            }),
        )
        .optional(),
});

type RdapEntityShape = {
    roles?: string[];
    vcardArray?: unknown[];
    publicIds?: { type?: string; identifier?: string }[];
    entities?: RdapEntityShape[];
};

/**
 * Registries disagree about which fields they publish and every one of them is
 * optional in RFC 9083, so the entity tree is recursive and entirely optional.
 */
export const rdapEntitySchema: z.ZodType<RdapEntityShape> = z.lazy(() =>
    z.object({
        roles: z.array(z.string()).optional(),
        vcardArray: z.array(z.unknown()).optional(),
        publicIds: z
            .array(z.object({ type: z.string().optional(), identifier: z.string().optional() }))
            .optional(),
        entities: z.array(rdapEntitySchema).optional(),
    }),
);

export const rdapNetworkSchema = z.object({
    name: z.string().optional(),
    country: z.string().optional(),
    entities: z.array(rdapEntitySchema).optional(),
});
