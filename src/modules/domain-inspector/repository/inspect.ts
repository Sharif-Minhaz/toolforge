import "server-only";

import { DNS_TYPE_CODES, MAX_INSPECTED_ADDRESSES } from "../domain/constants";
import { buildMailPosture, toDnsRecords } from "../domain/dns";
import { detectTechnologies } from "../domain/detect";
import { isIpAddress } from "../domain/ip";
import { guardAddresses } from "./address-guard";
import { queryDns } from "./doh";
import { probeSite, type SiteProbe } from "./http-probe";
import { describeAddress } from "./hosting";
import { checkPropagation } from "./propagation";
import { fetchDomainRegistration } from "./rdap";
import { fetchCertificate } from "./tls";
import {
    DNS_RECORD_TYPES,
    type DnsReport,
    type DomainBreakdown,
    type DomainReport,
    type HostAddress,
    type InspectionOptions,
    type PanelResult,
    type PropagationReport,
    type TechnologyMatch,
} from "../types";

/**
 * Fans one hostname out across every lookup and assembles the report.
 *
 * The order is not arbitrary. DNS runs first because everything else needs the
 * addresses it returns — and because those addresses are what the SSRF guard
 * checks before a single socket is opened to anything the reader named. Once
 * they are in hand the remaining four panels are independent, so they run
 * together and the slowest one sets the wall clock.
 *
 * No panel can fail another. Each returns its own typed reason, and a report
 * with four good panels and two refusals is the normal case for a domain that
 * parks its name and serves nothing.
 */

type PanelInputs = {
    readonly breakdown: DomainBreakdown;
    readonly options: InspectionOptions;
    readonly now: Date;
};

async function collectDns(
    breakdown: DomainBreakdown,
    options: InspectionOptions,
): Promise<PanelResult<DnsReport>> {
    const { hostname } = breakdown;
    const results = await Promise.all(
        DNS_RECORD_TYPES.map((type) => queryDns(hostname, type, options.resolver)),
    );

    // Every type failing means the name itself did not answer. One type failing
    // means the name has no records of that type, which is not a failure.
    if (results.every((result) => !result.ok)) {
        const nxdomain = results.some((result) => !result.ok && result.reason === "nxdomain");
        const first = results[0];

        return {
            ok: false,
            reason: nxdomain ? "nxdomain" : first.ok ? "no_records" : first.reason,
        };
    }

    const sets = DNS_RECORD_TYPES.map((type, index) => {
        const result = results[index];

        return {
            type,
            records: result.ok ? toDnsRecords(type, DNS_TYPE_CODES[type], result.answers) : [],
        };
    });

    // DMARC and MTA-STS live at their own prefixes, and both fall back to the
    // organisational domain rather than the exact name that was typed.
    const mailBase = breakdown.registrableDomain ?? hostname;

    const [dmarc, mtaSts] = await Promise.all([
        queryDns(`_dmarc.${mailBase}`, "TXT", options.resolver),
        queryDns(`_mta-sts.${mailBase}`, "TXT", options.resolver),
    ]);

    return {
        ok: true,
        data: {
            resolver: options.resolver,
            authenticated: results.some((result) => result.ok && result.authenticated),
            sets,
            mail: buildMailPosture(
                sets.find((set) => set.type === "TXT")?.records ?? [],
                dmarc.ok ? toDnsRecords("TXT", DNS_TYPE_CODES.TXT, dmarc.answers) : [],
                mtaSts.ok ? toDnsRecords("TXT", DNS_TYPE_CODES.TXT, mtaSts.answers) : [],
            ),
        },
    };
}

function addressesOf(dns: PanelResult<DnsReport>, breakdown: DomainBreakdown): readonly string[] {
    if (breakdown.isIp) {
        return [breakdown.hostname];
    }

    if (!dns.ok) {
        return [];
    }

    return dns.data.sets
        .filter((set) => set.type === "A" || set.type === "AAAA")
        .flatMap((set) => set.records.map((record) => record.value))
        .filter((value) => isIpAddress(value));
}

async function collectHosting(
    addresses: readonly string[],
    options: InspectionOptions,
): Promise<PanelResult<readonly HostAddress[]>> {
    const guarded = guardAddresses(addresses);

    if (!guarded.ok) {
        return guarded;
    }

    // Sequential rather than parallel: each address costs three upstream
    // queries, and a name with a dozen A records would otherwise open three
    // dozen connections on one button press.
    const described: HostAddress[] = [];

    for (const address of guarded.addresses.slice(0, MAX_INSPECTED_ADDRESSES)) {
        described.push(await describeAddress(address, options.resolver));
    }

    return { ok: true, data: described };
}

/**
 * Which record the nine resolvers are compared on.
 *
 * `A` unless the name publishes only `AAAA`, in which case comparing `A` would
 * show nine resolvers agreeing on nothing — technically true and useless. This
 * reads the answer already in hand rather than costing another query.
 */
function propagationType(dns: PanelResult<DnsReport>): PropagationReport["type"] {
    if (!dns.ok) {
        return "A";
    }

    const count = (type: "A" | "AAAA") =>
        dns.data.sets.find((set) => set.type === type)?.records.length ?? 0;

    return count("A") === 0 && count("AAAA") > 0 ? "AAAA" : "A";
}

function collectTechnologies(
    site: PanelResult<SiteProbe>,
    dns: PanelResult<DnsReport>,
): PanelResult<readonly TechnologyMatch[]> {
    const valuesOf = (type: "MX" | "NS") =>
        dns.ok
            ? (dns.data.sets.find((set) => set.type === type)?.records ?? []).map(
                  (record) => record.value,
              )
            : [];

    // Nothing to match against at all — no page and no delegation — is a
    // failure. An empty match list against real evidence is an answer.
    if (!site.ok && !dns.ok) {
        return { ok: false, reason: site.reason };
    }

    return {
        ok: true,
        data: detectTechnologies({
            headers: site.ok ? site.data.headers : {},
            cookieNames: site.ok ? site.data.cookieNames : [],
            html: site.ok ? site.data.html : "",
            generator: site.ok ? site.data.generator : null,
            mailExchangers: valuesOf("MX"),
            nameservers: valuesOf("NS"),
        }),
    };
}

export async function runInspection({
    breakdown,
    options,
    now,
}: PanelInputs): Promise<DomainReport> {
    const dns = breakdown.isIp
        ? ({ ok: false, reason: "no_records" } as const)
        : await collectDns(breakdown, options);

    const addresses = addressesOf(dns, breakdown);

    const [registration, hosting, propagation, certificate, site] = await Promise.all([
        breakdown.registrableDomain === null
            ? Promise.resolve({ ok: false, reason: "unsupported_tld" } as const)
            : fetchDomainRegistration(breakdown.registrableDomain, now),
        collectHosting(addresses, options),
        // An address has nothing to propagate: there is no name for the nine
        // resolvers to disagree about, only the number the reader already typed.
        breakdown.isIp
            ? Promise.resolve({ ok: false, reason: "no_records" } as const)
            : checkPropagation(breakdown.hostname, propagationType(dns)),
        // "Switched off" is its own reason. Reusing a lookup failure here would
        // tell the reader their certificate could not be reached, when in fact
        // nobody asked for it.
        options.probeSite
            ? certificateFor(breakdown, addresses, now)
            : Promise.resolve({ ok: false, reason: "skipped" } as const),
        options.probeSite
            ? probeSite(breakdown.hostname, options.resolver)
            : Promise.resolve({ ok: false, reason: "skipped" } as const),
    ]);

    return {
        breakdown,
        dns,
        registration,
        hosting,
        propagation,
        certificate,
        http: site.ok ? { ok: true, data: site.data.report } : site,
        technologies: collectTechnologies(site, dns),
        checkedAt: now.toISOString(),
    };
}

function certificateFor(breakdown: DomainBreakdown, addresses: readonly string[], now: Date) {
    const guarded = guardAddresses(addresses);

    return guarded.ok
        ? fetchCertificate(breakdown.hostname, guarded.addresses[0], now)
        : Promise.resolve(guarded);
}
