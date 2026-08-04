import "server-only";

import { DNS_TYPE_CODES, PROPAGATION_TIMEOUT_MS } from "../domain/constants";
import {
    PROPAGATION_NODES,
    summarizePropagation,
    type PropagationAnswer,
    type PropagationNode,
} from "../domain/propagation";
import { queryDnsAt } from "./doh";
import type { PanelResult, PropagationReport } from "../types";

/**
 * The propagation fan-out.
 *
 * Every node is asked at once — unlike the hosting panel, which walks its
 * addresses sequentially. The difference is cost per item: describing one
 * address is three upstream queries, so four addresses is a dozen connections
 * and worth pacing. This is one small GET per node against a service built to
 * answer millions of them, and nine in parallel is the whole point: a
 * sequential version would take nine times as long to tell the reader the same
 * thing.
 *
 * A node that fails is never an error. `Promise.all` over calls that each
 * resolve to a typed answer means one resolver being unreachable costs that one
 * row, and the panel still reports the other eight.
 */
async function askNode(
    node: PropagationNode,
    hostname: string,
    type: PropagationReport["type"],
): Promise<PropagationAnswer> {
    const startedAt = Date.now();

    const result = await queryDnsAt(node.endpoint, node.id, hostname, type, PROPAGATION_TIMEOUT_MS);

    const elapsedMs = Date.now() - startedAt;

    // `no_records` and `nxdomain` are answers, not failures: a resolver that
    // says "this name has no address" has told us what it knows, and that is
    // exactly the state a half-propagated deletion is in.
    if (!result.ok) {
        const answered = result.reason === "no_records" || result.reason === "nxdomain";

        return { id: node.id, ok: answered, values: [], ttl: null, elapsedMs };
    }

    const wanted = result.answers.filter((answer) => answer.type === DNS_TYPE_CODES[type]);

    return {
        id: node.id,
        ok: true,
        // Sorted here rather than at the comparison, so a round-robin record
        // that arrives shuffled compares equal without every consumer having to
        // remember to sort it first.
        values: [...new Set(wanted.map((answer) => answer.data))].sort(),
        ttl: wanted.length > 0 ? Math.min(...wanted.map((answer) => answer.TTL)) : null,
        elapsedMs,
    };
}

export async function checkPropagation(
    hostname: string,
    type: PropagationReport["type"],
): Promise<PanelResult<PropagationReport>> {
    const answers = await Promise.all(
        PROPAGATION_NODES.map((node) => askNode(node, hostname, type)),
    );

    const report = summarizePropagation(type, answers);

    // Nothing answered at all is a network problem on this side, not a finding
    // about the domain — nine independent operators do not fail together.
    if (report.answered === 0 && report.nodes.every((node) => node.state === "unreachable")) {
        return { ok: false, reason: "network_error" };
    }

    return { ok: true, data: report };
}
