import "server-only";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { DNS_STATUS_NOERROR, DNS_STATUS_NXDOMAIN, type DohAnswer } from "../domain/dns";
import { DNS_TIMEOUT_MS, DNS_TYPE_CODES, RESOLVER_ENDPOINTS } from "../domain/network-constants";
import type { DnsFailureReason, DnsResolver } from "../types/network";
import { dohResponseSchema } from "../validation/network";

/**
 * DNS over HTTPS, which is the transport layer under every tool here that asks
 * a name server anything.
 *
 * Everything asks the same way — record panels, reverse lookups, and the ASN
 * lookups through Team Cymru's TXT zones — so there is one place where a
 * timeout, a malformed answer, or a resolver having a bad day is turned into a
 * typed reason. Using DoH rather than `node:dns` also means the answer comes
 * from the resolver the reader picked rather than from whatever this container
 * happens to have in `/etc/resolv.conf`, which is the difference between a
 * lookup they can reproduce and one they cannot.
 *
 * Lifted out of the Domain Inspector when the IP & Route Globe needed the same
 * transport. The log lines name the resolver rather than the caller, because
 * which upstream is misbehaving is the fact worth having in the log.
 */

export type QueryableRecordType = keyof typeof DNS_TYPE_CODES;

export type DohQueryResult =
    | {
          readonly ok: true;
          readonly authenticated: boolean;
          readonly answers: readonly DohAnswer[];
      }
    | { readonly ok: false; readonly reason: DnsFailureReason };

export async function queryDns(
    name: string,
    type: QueryableRecordType,
    resolver: DnsResolver,
): Promise<DohQueryResult> {
    return queryDnsAt(RESOLVER_ENDPOINTS[resolver], resolver, name, type, DNS_TIMEOUT_MS);
}

/**
 * The same query against an endpoint chosen by the caller rather than by the
 * reader, which is what the propagation fan-out needs: nine operators asked the
 * one question. `label` is only ever a node id from our own table — it names
 * the upstream in the log line and never reaches a URL.
 *
 * The timeout is a parameter because the callers want different ones. A single
 * lookup a whole report waits on can afford six seconds; one of nine running in
 * parallel cannot, since the slowest sets the wall clock for all.
 */
export async function queryDnsAt(
    endpoint: string,
    label: string,
    name: string,
    type: QueryableRecordType,
    timeoutMs: number,
): Promise<DohQueryResult> {
    const url = new URL(endpoint);
    const resolver = label;

    url.searchParams.set("name", name);
    url.searchParams.set("type", type);

    try {
        const response = await fetch(url, {
            headers: { accept: "application/dns-json" },
            cache: "no-store",
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
            return { ok: false, reason: "network_error" };
        }

        const parsed = dohResponseSchema.safeParse(await response.json());

        if (!parsed.success) {
            logEvent("warn", "tools.doh_unreadable", { resolver, type });

            return { ok: false, reason: "unreadable_response" };
        }

        if (parsed.data.Status === DNS_STATUS_NXDOMAIN) {
            return { ok: false, reason: "nxdomain" };
        }

        if (parsed.data.Status !== DNS_STATUS_NOERROR) {
            return { ok: false, reason: "no_records" };
        }

        return {
            ok: true,
            authenticated: parsed.data.AD === true,
            answers: parsed.data.Answer ?? [],
        };
    } catch (caught) {
        const timedOut = caught instanceof Error && caught.name === "TimeoutError";

        logEvent("warn", "tools.doh_failed", {
            resolver,
            type,
            error: describeError(caught),
        });

        return { ok: false, reason: timedOut ? "timeout" : "network_error" };
    }
}

/** The first TXT string of an answer, unquoted — the shape Cymru replies in. */
export async function queryTxtValue(name: string, resolver: DnsResolver): Promise<string | null> {
    const result = await queryDns(name, "TXT", resolver);

    if (!result.ok) {
        return null;
    }

    const answer = result.answers.find((candidate) => candidate.type === DNS_TYPE_CODES.TXT);

    return answer === undefined ? null : answer.data.replace(/^"|"$/g, "");
}
