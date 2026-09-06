import "server-only";

import { logEvent } from "@/modules/observability/domain/logger";
import { fetchRdapJson } from "@/modules/tools/repository/rdap";
import { toDomainRegistration } from "../domain/rdap";
import type { DomainRegistration, PanelFailureReason } from "../types";
import { rdapDomainSchema } from "../validation/inspection";

/**
 * The registration record for a domain.
 *
 * The request itself, and the network half of RDAP, moved to
 * `tools/repository/rdap.ts` when the IP & Route Globe needed to ask the same
 * registries who holds a block. What stayed is the half only this tool renders:
 * who registered a name, when it expires, and who to complain to.
 *
 * The cost of RDAP over WHOIS is the ccTLDs which have not delegated an RDAP
 * service — .de among them. Those come back as `unsupported_tld`, which the UI
 * states plainly and points at the registry's own WHOIS page, rather than
 * pretending the domain has no registration.
 */

export type RdapDomainResult =
    | { readonly ok: true; readonly data: DomainRegistration }
    | { readonly ok: false; readonly reason: PanelFailureReason };

export async function fetchDomainRegistration(
    registrableDomain: string,
    now: Date,
): Promise<RdapDomainResult> {
    const response = await fetchRdapJson(`/domain/${encodeURIComponent(registrableDomain)}`);

    if (!response.ok) {
        return response;
    }

    const parsed = rdapDomainSchema.safeParse(response.payload);

    if (!parsed.success) {
        logEvent("warn", "domain_inspector.rdap_unreadable", { domain: registrableDomain });

        return { ok: false, reason: "unreadable_response" };
    }

    return {
        ok: true,
        data: toDomainRegistration({ payload: parsed.data, source: response.source, now }),
    };
}
