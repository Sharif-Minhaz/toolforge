import { z } from "zod";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";
import { rdapEntitySchema, resolverSchema } from "@/modules/tools/validation/network";
import { MAX_INPUT_LENGTH } from "../domain/constants";

export { resolverSchema };

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
 * RDAP, read loosely on purpose — the entity tree comes from
 * `tools/validation/network.ts`, which the network lookups share.
 */
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
