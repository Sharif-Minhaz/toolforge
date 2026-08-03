import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";
import { MAX_INPUT_LENGTH } from "../domain/constants";
import { DNS_RESOLVERS } from "../types";

export const resolverSchema = z.enum(DNS_RESOLVERS);

export const hostInputSchema = z.string().min(1).max(MAX_INPUT_LENGTH);

/**
 * Payload of the `inspectDomain` server action.
 *
 * The hostname is only length-checked here. What it decomposes into — and
 * whether it decomposes at all — is `readHostInput`'s job, because a Zod
 * refinement would collapse "that is not a hostname" and "that TLD does not
 * exist" into one unhelpful message.
 */
export const inspectionRequestSchema = z.object({
    token: z.string().min(1).max(MAX_TURNSTILE_TOKEN_LENGTH),
    host: hostInputSchema,
    resolver: resolverSchema,
    probeSite: z.boolean(),
});

/**
 * `/tools/domain-inspector?host=example.com&resolver=google`. Each field
 * catches on its own, so a mangled link opens on defaults rather than a 500.
 */
export const inspectionSearchParamsSchema = z.object({
    host: hostInputSchema.optional().catch(undefined),
    resolver: resolverSchema.optional().catch(undefined),
});

/**
 * The DoH JSON answer, per the `application/dns-json` shape Cloudflare, Google
 * and Quad9 all serve. `Answer` is absent — not empty — when there is nothing
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

/**
 * RDAP, read loosely on purpose. Registries disagree about which of these they
 * publish and every one of them is optional in RFC 9083; a strict schema here
 * would turn a partial record into no record at all.
 */
const rdapEntitySchema: z.ZodType<RdapEntityShape> = z.lazy(() =>
    z.object({
        roles: z.array(z.string()).optional(),
        vcardArray: z.array(z.unknown()).optional(),
        publicIds: z
            .array(z.object({ type: z.string().optional(), identifier: z.string().optional() }))
            .optional(),
        entities: z.array(rdapEntitySchema).optional(),
    }),
);

type RdapEntityShape = {
    roles?: string[];
    vcardArray?: unknown[];
    publicIds?: { type?: string; identifier?: string }[];
    entities?: RdapEntityShape[];
};

export const rdapDomainSchema = z.object({
    handle: z.string().optional(),
    ldhName: z.string().optional(),
    status: z.array(z.string()).optional(),
    events: z
        .array(z.object({ eventAction: z.string().optional(), eventDate: z.string().optional() }))
        .optional(),
    nameservers: z.array(z.object({ ldhName: z.string().optional() })).optional(),
    secureDNS: z
        .object({ delegationSigned: z.boolean().optional(), zoneSigned: z.boolean().optional() })
        .optional(),
    entities: z.array(rdapEntitySchema).optional(),
});

export const rdapNetworkSchema = z.object({
    name: z.string().optional(),
    country: z.string().optional(),
    entities: z.array(rdapEntitySchema).optional(),
});
