import { z } from "zod";

import { MAX_INPUT_LENGTH } from "@/modules/ip-globe/domain/constants";
import { canGroupByCountry } from "@/modules/ip-globe/domain/markers";
import { routeModeSchema } from "@/modules/ip-globe/validation/route-request";
import { DEFAULT_RESOLVER } from "@/modules/tools/domain/network-constants";
import { resolverSchema } from "@/modules/tools/validation/network";

import { defineMcpTool } from "../domain/define-tool";
import { toJsonValue } from "../domain/json-safe";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * Where a route goes, for a caller with a context window.
 *
 * The globe is presentation and nothing here needs it: the domain layer's answer
 * is a list of hops with coordinates on them, and a model reading `country`,
 * `asn` and `org` has the whole finding. Only the canvas is missing, which is
 * why this tool exists rather than being one of the four listed as unexposable.
 *
 * `kind: "network"` for the usual reason — the call leaves this process — which
 * puts it behind `MCP_ACCESS_TOKEN`. The page has no Turnstile to replace; what
 * protects three free registries is the quota inside `runRoute`, and it is spent
 * on this path exactly as it is on the page.
 *
 * **The coordinates are country centroids, and the description says so.** A
 * model handed `[37.09, -95.71]` with no other context will report it as a
 * location, which would turn "this block is allocated to a US registrant" into
 * "this router is in Kansas". Saying it in the description is cheaper than
 * correcting it downstream.
 */
export const ipGlobeMapTool = defineMcpTool({
    toolId: "ip-globe",
    verb: "map",
    title: "Locate the hops of a route",
    description:
        "Look up where the addresses on a network route were allocated. Takes either a list of hosts (one per line) or pasted traceroute, tracert, or mtr --report output, and returns one entry per hop with its address, reverse name, ASN, network operator, allocation country and that country's centroid coordinates. Passive: it queries public DNS, Team Cymru's ASN zones and the RDAP registries, and never contacts the hosts themselves — it cannot run a traceroute, only read one you already have. Coordinates are COUNTRY CENTROIDS from the routing registry's allocation record, not a geo-IP position: they say which country a block was assigned to, never where a machine is. Makes outbound requests from the ToolForge server, so it requires the MCP access token.",
    kind: "network",
    inputSchema: z.object({
        input: z
            .string()
            .min(1)
            .max(MAX_INPUT_LENGTH)
            .describe(
                "Hosts one per line, or the pasted output of traceroute, tracert or mtr --report",
            ),
        mode: routeModeSchema
            .default("hosts")
            .describe(
                "hosts reads one name, address or URL per line; traceroute parses printed hop output. Chosen, not sniffed",
            ),
        resolver: resolverSchema
            .default(DEFAULT_RESOLVER)
            .describe(
                "Which public DoH resolver resolves any names. Irrelevant when every hop is already a literal address",
            ),
    }),
    run: async ({ input, mode, resolver }) => {
        // Imported here rather than at the top of the file. `route.ts` is marked
        // `server-only`, and a static import would put that marker in the import
        // graph of the whole registry — which the tests load to check every
        // tool's name and schema, outside a server runtime.
        const { runRoute } = await import("@/modules/ip-globe/repository/route");

        const result = await runRoute({
            input,
            mode,
            resolver,
            // A literal, because an MCP call has no address here. It gives every
            // MCP caller one shared allowance on top of the endpoint's own
            // limiter, which is the conservative reading and the right one
            // against somebody else's free tier.
            callerKey: "mcp",
        });

        if (!result.ok) {
            return refuseWithReason("Route lookup", result.reason);
        }

        const { report } = result;

        return succeed(
            `${report.summary.total} hops, ${report.summary.located} located across ${report.summary.countries.length} countries and ${report.summary.asns.length} networks.`,
            toJsonValue({
                mode: report.mode,
                checkedAt: report.checkedAt,
                summary: report.summary,
                /**
                 * True when several hops share one allocation country, which is
                 * the case where treating each coordinate as a distinct place
                 * would overcount the route.
                 */
                sharesCountries: canGroupByCountry(report.hops),
                coordinates: "country centroid from the allocation registry, not a geo-IP position",
                hops: report.hops,
            }),
        );
    },
});
