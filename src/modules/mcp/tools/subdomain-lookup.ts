import { z } from "zod";

import { readApexInput } from "@/modules/subdomain-lookup/domain/apex";
import { MCP_DEFAULT_LIMIT } from "@/modules/subdomain-lookup/domain/constants";
import { filterRecords, sortRecords } from "@/modules/subdomain-lookup/domain/list";
import {
    apexInputSchema,
    resultLimitSchema,
    subdomainSortSchema,
} from "@/modules/subdomain-lookup/validation/lookup-request";

import { defineMcpTool } from "../domain/define-tool";
import { toJsonValue } from "../domain/json-safe";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * The subdomain index, for a caller with a context window.
 *
 * `kind: "network"` for the usual reason — the call leaves this process — which
 * puts it behind `MCP_ACCESS_TOKEN`. The page has no Turnstile to replace here;
 * what protects the upstream's shared allowance is the quota inside
 * `runSubdomainLookup`, and it is spent on this path exactly as it is on the
 * page. That is the whole reason the orchestration lives in `repository/` rather
 * than in the Server Action: a second entry point that skipped the counter would
 * spend this deployment's daily budget without counting it.
 *
 * **`limit`, `contains` and `sort` are not conveniences.** They are this
 * adapter's answer to the same problem the page solves with paging. An apex can
 * hold twenty thousand names; handing all of them to a model is not a better
 * answer than handing it two hundred and the count, it is a lost conversation.
 * So the counts always come back in full — `total` is what the index holds,
 * `matched` is what the filter kept, `returned` is what is in this reply — and
 * `truncated` names the case where the caller should narrow rather than guess.
 */
export const subdomainLookupTool = defineMcpTool({
    toolId: "subdomain-lookup",
    verb: "lookup",
    title: "Find subdomains of a domain",
    description:
        "List the subdomains of a domain from a public certificate transparency index, with the date each name was first seen. Passive: it reads an index and never contacts the domain, opens a port, or issues a DNS query. The domain must be a registrable domain (eTLD+1); a subdomain or URL is widened to one and the result says so. Large domains return far more names than fit in a reply, so filter with `contains` and read `total` and `matched` before assuming the list is complete. Makes an outbound request from the ToolForge server, so it requires the MCP access token.",
    kind: "network",
    inputSchema: z.object({
        apex: apexInputSchema.describe(
            "A registrable domain such as example.com. A subdomain or URL is widened to its registrable domain",
        ),
        contains: z
            .string()
            .max(253)
            .default("")
            .describe("Keep only names containing this text. Empty means every name"),
        sort: subdomainSortSchema
            .default("hierarchy")
            .describe(
                "hierarchy compares labels right to left so a branch stays together; newest and oldest order by first-seen date and put undated names last",
            ),
        limit: resultLimitSchema.describe(
            `How many names to return. Defaults to ${MCP_DEFAULT_LIMIT}; the counts in the reply are never limited`,
        ),
    }),
    run: async ({ apex, contains, sort, limit }) => {
        const read = readApexInput(apex);

        if (!read.ok) {
            return refuseWithReason("Subdomain lookup", read.reason);
        }

        // Imported here rather than at the top of the file. `lookup.ts` is
        // marked `server-only`, and a static import would put that marker in the
        // import graph of the whole registry — which the tests load to check
        // every tool's name and schema, outside a server runtime.
        const { runSubdomainLookup } = await import("@/modules/subdomain-lookup/repository/lookup");

        const report = await runSubdomainLookup({
            apex: read.apex,
            narrowedFrom: read.narrowedFrom,
            // A literal, because an MCP call has no address here. It gives every
            // MCP caller one shared per-caller allowance on top of the
            // endpoint's own limiter, which is the conservative reading and the
            // right one against somebody else's free tier.
            callerKey: "mcp",
        });

        if (!report.ok) {
            return refuseWithReason("Subdomain lookup", report.reason, {
                apex: read.apex,
                ...(report.allowance === undefined
                    ? {}
                    : { retryAfter: report.allowance.resetsAt }),
            });
        }

        const matched = filterRecords(sortRecords(report.records, sort), contains);
        const returned = matched.slice(0, limit);

        return succeed(
            `${report.summary.total} names on file for ${report.apex}; ${matched.length} matched, ${returned.length} returned.`,
            toJsonValue({
                apex: report.apex,
                narrowedFrom: report.narrowedFrom,
                source: "crt.name",
                fetchedAt: report.fetchedAt,
                summary: report.summary,
                matched: matched.length,
                returned: returned.length,
                /** True when this reply is a prefix — narrow `contains` or raise `limit`. */
                truncated: returned.length < matched.length,
                records: returned,
            }),
        );
    },
});
