import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { RDAP_BOOTSTRAP_URL, RDAP_TIMEOUT_MS } from "../domain/constants";
import { toDomainRegistration, toNetworkInfo, type NetworkInfo } from "../domain/rdap";
import type { DomainRegistration, PanelFailureReason } from "../types";
import { rdapDomainSchema, rdapNetworkSchema } from "../validation/inspection";

/**
 * Registration data over RDAP rather than WHOIS.
 *
 * WHOIS is a plain-text protocol on port 43 whose reply format is whatever each
 * registry felt like: parsing it means a per-registry table of field names that
 * rots continuously. RDAP is the IETF's replacement, it is JSON, it is
 * mandatory for every gTLD, and it needs nothing but an HTTPS request.
 *
 * What that costs is the ccTLDs which have not delegated an RDAP service — .de
 * among them. Those come back as `unsupported_tld`, which the UI states plainly
 * and points at the registry's own WHOIS page, rather than pretending the
 * domain has no registration.
 */

export type RdapDomainResult =
    | { readonly ok: true; readonly data: DomainRegistration }
    | { readonly ok: false; readonly reason: PanelFailureReason };

async function fetchRdap(path: string): Promise<
    | { readonly ok: true; readonly payload: unknown; readonly source: string | null }
    | {
          readonly ok: false;
          readonly reason: PanelFailureReason;
      }
> {
    try {
        const response = await fetch(`${RDAP_BOOTSTRAP_URL}${path}`, {
            headers: { accept: "application/rdap+json" },
            cache: "no-store",
            redirect: "follow",
            signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
        });

        // The bootstrap redirector answers 404 both for "no such object" and
        // for "no registry has told us where to ask", and 501 for a TLD with
        // no RDAP service at all.
        if (response.status === 404 || response.status === 501) {
            return { ok: false, reason: "unsupported_tld" };
        }

        if (!response.ok) {
            return { ok: false, reason: "network_error" };
        }

        // `response.url` is the registry that actually answered, which is worth
        // showing: it is the difference between a citation and a claim.
        let source: string | null = null;

        try {
            source = new URL(response.url).host;
        } catch {
            source = null;
        }

        return { ok: true, payload: await response.json(), source };
    } catch (caught) {
        const timedOut = caught instanceof Error && caught.name === "TimeoutError";

        logEvent("warn", "domain_inspector.rdap_failed", {
            path,
            error: describeError(caught),
        });

        return { ok: false, reason: timedOut ? "timeout" : "network_error" };
    }
}

export async function fetchDomainRegistration(
    registrableDomain: string,
    now: Date,
): Promise<RdapDomainResult> {
    const response = await fetchRdap(`/domain/${encodeURIComponent(registrableDomain)}`);

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

/**
 * The routing registry's record for an address: which network it belongs to and
 * who holds it. Registry data, not a geo-IP guess — it says who was allocated
 * the block, which is a claim that can be checked, rather than where a database
 * thinks the machine is.
 */
export async function fetchNetworkInfo(ip: string): Promise<NetworkInfo | null> {
    const response = await fetchRdap(`/ip/${encodeURIComponent(ip)}`);

    if (!response.ok) {
        return null;
    }

    const parsed = rdapNetworkSchema.safeParse(response.payload);

    return parsed.success ? toNetworkInfo(parsed.data) : null;
}
