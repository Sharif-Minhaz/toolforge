import { countryLocation } from "./countries";
import type { PropagationNodeResult, PropagationReport, PropagationState } from "../types";

/**
 * Asking the same question of several independent resolvers, and saying
 * plainly what that does and does not prove.
 *
 * What it proves: whether the operators agree. Every recursive resolver keeps
 * its own cache and does its own resolution, so a record changed ten minutes
 * ago can be live at one and stale at another. That divergence *is* what a DNS
 * change in flight looks like from the outside, and it is the thing somebody
 * mid-migration actually wants to see.
 *
 * What it does not prove: anything about geography. Every query here leaves the
 * one server this tool runs on, so this is nine operators from one vantage
 * point, not nine vantage points — and for the anycast services a query to
 * `1.1.1.1` is answered by whichever Cloudflare node is nearest *this* server,
 * not by one in the country on the pin. `anycast` is carried on every node so
 * the UI can say so rather than letting the map imply otherwise. A tool that
 * quietly claimed nine locations would be easier to build and would be lying.
 *
 * Pure: the repository does the fetching, this decides what the answers mean.
 */

export type PropagationNode = {
    readonly id: string;
    /** The operator's own name. A proper noun — never translated. */
    readonly name: string;
    /** Must speak `application/dns-json` on 443 and accept `?name=&type=`. */
    readonly endpoint: string;
    /**
     * Where the operator publishes the service as being run from. For an
     * anycast service this is the operator, not the machine that answers.
     */
    readonly country: string;
    readonly anycast: boolean;
};

/**
 * Every entry was verified by hand before it was added: the endpoint answers
 * `application/dns-json` on 443 to a plain `?name=&type=` GET, which most
 * public resolvers do not — RFC 8484 wire format is the common case and the
 * JSON API is a Cloudflare/Google extension only some operators implement.
 *
 * Three otherwise-obvious candidates are deliberately absent, and each is a
 * trap worth naming:
 *
 * - **Quad9** serves JSON only on port 5053. Enough egress firewalls block a
 *   non-standard outbound port that the node would time out rather than answer.
 * - **NextDNS** answers JSON, but the anycast address this server reaches is
 *   registered in Austria while the company is American — so there is no single
 *   country to write down that is not misleading one way or the other.
 * - **Tiarap** and **RethinkDNS** both sit behind Cloudflare, so their pins
 *   would land on Cloudflare's network rather than their own. A duplicate pin
 *   dressed as an independent one is worse than no pin.
 *
 * To re-verify: `curl -H 'accept: application/dns-json'
 * '<endpoint>?name=example.com&type=A'` should return an object with `Answer`.
 */
export const PROPAGATION_NODES: readonly PropagationNode[] = [
    {
        id: "cloudflare",
        name: "Cloudflare",
        endpoint: "https://cloudflare-dns.com/dns-query",
        country: "US",
        anycast: true,
    },
    {
        id: "google",
        name: "Google Public DNS",
        endpoint: "https://dns.google/resolve",
        country: "US",
        anycast: true,
    },
    {
        id: "adguard",
        name: "AdGuard DNS",
        endpoint: "https://dns.adguard-dns.com/resolve",
        country: "CY",
        anycast: true,
    },
    {
        id: "dnssb",
        name: "DNS.SB",
        endpoint: "https://doh.sb/dns-query",
        country: "DE",
        anycast: true,
    },
    {
        id: "quad101",
        name: "Quad101 (TWNIC)",
        endpoint: "https://dns.twnic.tw/dns-query",
        country: "TW",
        anycast: false,
    },
    {
        id: "seby",
        name: "Seby DNS",
        endpoint: "https://doh.seby.io/dns-query",
        country: "AU",
        anycast: false,
    },
    {
        id: "alidns",
        name: "AliDNS",
        endpoint: "https://dns.alidns.com/resolve",
        country: "CN",
        anycast: false,
    },
    {
        id: "dnspod",
        name: "DNSPod Public DNS",
        endpoint: "https://doh.pub/dns-query",
        country: "CN",
        anycast: false,
    },
    {
        id: "dns360",
        name: "360 Secure DNS",
        endpoint: "https://doh.360.cn/resolve",
        country: "CN",
        anycast: false,
    },
];

/** What the repository hands back per node, before any of it means anything. */
export type PropagationAnswer = {
    readonly id: string;
    /** The resolver replied at all. `false` covers a timeout and a bad reply alike. */
    readonly ok: boolean;
    /** Addresses, already sorted, so two nodes compare by value and not by order. */
    readonly values: readonly string[];
    readonly ttl: number | null;
    readonly elapsedMs: number;
};

/** Two answers are the same answer when they hold the same set of addresses. */
function signatureOf(values: readonly string[]): string {
    return values.join(" ");
}

/**
 * The answer the most resolvers gave. Ties go to whichever appeared first,
 * which is node-table order — deterministic, so the same inputs always produce
 * the same report, and never `Math.random`-flavoured "whichever won today".
 */
function findConsensus(answers: readonly PropagationAnswer[]): readonly string[] {
    const counts = new Map<string, { readonly values: readonly string[]; count: number }>();

    for (const answer of answers) {
        if (!answer.ok || answer.values.length === 0) {
            continue;
        }

        const key = signatureOf(answer.values);
        const seen = counts.get(key);

        if (seen === undefined) {
            counts.set(key, { values: answer.values, count: 1 });
        } else {
            seen.count += 1;
        }
    }

    let best: { readonly values: readonly string[]; count: number } | null = null;

    for (const entry of counts.values()) {
        if (best === null || entry.count > best.count) {
            best = entry;
        }
    }

    return best?.values ?? [];
}

function stateOf(answer: PropagationAnswer, consensus: string): PropagationState {
    if (!answer.ok) {
        return "unreachable";
    }

    if (answer.values.length === 0) {
        return "empty";
    }

    return signatureOf(answer.values) === consensus ? "agreed" : "differs";
}

export function summarizePropagation(
    type: PropagationReport["type"],
    answers: readonly PropagationAnswer[],
): PropagationReport {
    const consensus = findConsensus(answers);
    const consensusSignature = signatureOf(consensus);

    const nodes: PropagationNodeResult[] = [];

    for (const node of PROPAGATION_NODES) {
        const answer = answers.find((candidate) => candidate.id === node.id);

        // A node with no answer object at all is a node that was never asked —
        // reported as unreachable rather than silently dropped, so the count in
        // the header always matches the rows underneath it.
        const resolved: PropagationAnswer = answer ?? {
            id: node.id,
            ok: false,
            values: [],
            ttl: null,
            elapsedMs: 0,
        };

        nodes.push({
            id: node.id,
            name: node.name,
            country: node.country,
            anycast: node.anycast,
            state: stateOf(resolved, consensusSignature),
            values: resolved.values,
            ttl: resolved.ttl,
            elapsedMs: resolved.elapsedMs,
        });
    }

    return {
        type,
        consensus,
        agreed: nodes.filter((node) => node.state === "agreed").length,
        answered: nodes.filter((node) => node.state === "agreed" || node.state === "differs")
            .length,
        total: nodes.length,
        nodes,
    };
}

/**
 * The verdict the card leads with.
 *
 * `warn`, never `bad`, when resolvers disagree: mid-migration divergence is the
 * expected state of a change that was made correctly ten minutes ago, and a red
 * light on it would teach readers to ignore the red light.
 */
export function propagationTone(report: PropagationReport): "good" | "warn" | "idle" {
    if (report.answered === 0) {
        return "idle";
    }

    return report.agreed === report.answered ? "good" : "warn";
}

/** Every resolver in one country shares a pin, so three Chinese nodes are one dot. */
export type PropagationCluster = {
    readonly country: string;
    readonly latitude: number;
    readonly longitude: number;
    /** English fallback; the UI localises it where `Intl` has the name. */
    readonly name: string;
    readonly nodes: readonly PropagationNodeResult[];
    readonly tone: PropagationClusterTone;
};

export const PROPAGATION_CLUSTER_TONES = ["agreed", "differs", "silent"] as const;

export type PropagationClusterTone = (typeof PROPAGATION_CLUSTER_TONES)[number];

function clusterTone(nodes: readonly PropagationNodeResult[]): PropagationClusterTone {
    if (nodes.some((node) => node.state === "differs")) {
        return "differs";
    }

    return nodes.some((node) => node.state === "agreed") ? "agreed" : "silent";
}

/**
 * Pins, in node-table order. A country the coordinate table does not know is
 * dropped from the map and stays in the list underneath, because a resolver
 * that answered is a result whether or not it can be drawn.
 */
export function clusterByCountry(
    nodes: readonly PropagationNodeResult[],
): readonly PropagationCluster[] {
    const clusters = new Map<string, PropagationNodeResult[]>();

    for (const node of nodes) {
        const existing = clusters.get(node.country);

        if (existing === undefined) {
            clusters.set(node.country, [node]);
        } else {
            existing.push(node);
        }
    }

    const built: PropagationCluster[] = [];

    for (const [country, members] of clusters) {
        const location = countryLocation(country);

        if (location === null) {
            continue;
        }

        built.push({
            country: location.code,
            latitude: location.latitude,
            longitude: location.longitude,
            name: location.name,
            nodes: members,
            tone: clusterTone(members),
        });
    }

    return built;
}
