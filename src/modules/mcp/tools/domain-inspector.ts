import { z } from "zod";

import { readHostInput } from "@/modules/domain-inspector/domain/hostname";
import { hostInputSchema, resolverSchema } from "@/modules/domain-inspector/validation/inspection";
import { classifyAddress } from "@/modules/tools/domain/ip";

import { defineMcpTool } from "../domain/define-tool";
import { toJsonValue } from "../domain/json-safe";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * The one tool here that reaches the network, and the reason the token gate
 * exists at all.
 *
 * On the page this is protected by a Turnstile challenge: a human proof, spent
 * before anything leaves the server, because without it the tool is a free
 * scanner running from this deployment's address with this site's name on the
 * packets. An MCP client cannot solve a Turnstile, so the challenge is replaced
 * rather than dropped — `kind: "network"` puts this behind `MCP_ACCESS_TOKEN`,
 * and with no token configured the call is refused instead of served. Same
 * question, same answer, different proof.
 *
 * The two checks below the schema are the same ones the Server Action runs, in
 * the same order and for the same reasons: decompose before spending anything,
 * and refuse a literal private address here so the caller is told their input
 * was rejected rather than watching every panel fail. Everything deeper — the
 * per-hop address guard that stops a name resolving to `169.254.169.254` —
 * lives in `runInspection` and applies identically.
 */
export const domainInspectTool = defineMcpTool({
    toolId: "domain-inspector",
    verb: "inspect",
    title: "Inspect a domain",
    description:
        "Look up everything public about a hostname: DNS records across resolvers, WHOIS/RDAP registration and expiry, hosting and ASN, TLS certificate and its expiry, HTTP redirect chain and security headers, and detected technologies. Makes outbound requests from the ToolForge server, so it requires the MCP access token. Private and link-local addresses are refused.",
    kind: "network",
    inputSchema: z.object({
        host: hostInputSchema.describe("A hostname or a public IP address"),
        resolver: resolverSchema
            .default("cloudflare")
            .describe("Which public DNS-over-HTTPS resolver to ask"),
        probeSite: z
            .boolean()
            .default(true)
            .describe("Also fetch the site over TLS. Off means DNS and WHOIS only"),
    }),
    run: async ({ host, resolver, probeSite }) => {
        const read = readHostInput(host);

        if (!read.ok) {
            return refuseWithReason("Domain inspector", read.reason);
        }

        if (read.breakdown.isIp && classifyAddress(read.breakdown.hostname) !== "public") {
            return refuseWithReason("Domain inspector", "private_address");
        }

        // Imported here rather than at the top of the file. `inspect.ts` is
        // marked `server-only`, and a static import would put that marker in
        // the import graph of the whole registry — which the tests load to
        // check every tool's name and schema, outside a server runtime. Loading
        // it at the point of use keeps one array in `tools/index.ts` and keeps
        // that array testable.
        const { runInspection } = await import("@/modules/domain-inspector/repository/inspect");

        const report = await runInspection({
            breakdown: read.breakdown,
            options: { resolver, probeSite },
            now: new Date(),
        });

        return succeed(`Inspected ${read.breakdown.hostname}`, toJsonValue(report));
    },
});
