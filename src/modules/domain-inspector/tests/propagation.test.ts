import { describe, expect, test } from "bun:test";

import { countryLocation } from "@/modules/domain-inspector/domain/countries";
import {
    clusterByCountry,
    PROPAGATION_NODES,
    propagationTone,
    summarizePropagation,
    type PropagationAnswer,
} from "@/modules/domain-inspector/domain/propagation";
import type { PropagationState } from "@/modules/domain-inspector/types";

function answer(id: string, values: readonly string[], ok = true): PropagationAnswer {
    return { id, ok, values, ttl: 300, elapsedMs: 40 };
}

/** Every node answering the same thing — the shape a settled domain produces. */
function allAgreeing(values: readonly string[]): readonly PropagationAnswer[] {
    return PROPAGATION_NODES.map((node) => answer(node.id, values));
}

function stateFor(
    report: ReturnType<typeof summarizePropagation>,
    id: string,
): PropagationState | undefined {
    return report.nodes.find((node) => node.id === id)?.state;
}

describe("the node table", () => {
    test("has a unique id per node", () => {
        const ids = PROPAGATION_NODES.map((node) => node.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    test("points every node at a distinct HTTPS endpoint on the default port", () => {
        const endpoints = new Set<string>();

        for (const node of PROPAGATION_NODES) {
            const url = new URL(node.endpoint);

            expect(url.protocol).toBe("https:");
            // A non-standard port is what put Quad9 out of this table; a node
            // added later must not quietly reintroduce the problem.
            expect(url.port).toBe("");
            endpoints.add(node.endpoint);
        }

        expect(endpoints.size).toBe(PROPAGATION_NODES.length);
    });

    test("gives every node a mappable country", () => {
        for (const node of PROPAGATION_NODES) {
            expect(countryLocation(node.country)).not.toBeNull();
        }
    });

    test("spreads the nodes across more than one country", () => {
        const countries = new Set(PROPAGATION_NODES.map((node) => node.country));

        expect(countries.size).toBeGreaterThanOrEqual(4);
    });
});

describe("summarizePropagation", () => {
    test("calls it agreed when every resolver returns the same set", () => {
        const report = summarizePropagation("A", allAgreeing(["1.2.3.4"]));

        expect(report.consensus).toEqual(["1.2.3.4"]);
        expect(report.agreed).toBe(PROPAGATION_NODES.length);
        expect(report.answered).toBe(PROPAGATION_NODES.length);
        expect(report.total).toBe(PROPAGATION_NODES.length);
        expect(report.nodes.every((node) => node.state === "agreed")).toBe(true);
    });

    test("marks the minority as differing, not the majority", () => {
        const stale = PROPAGATION_NODES[0].id;
        const answers = PROPAGATION_NODES.map((node) =>
            answer(node.id, node.id === stale ? ["9.9.9.9"] : ["1.2.3.4"]),
        );

        const report = summarizePropagation("A", answers);

        expect(report.consensus).toEqual(["1.2.3.4"]);
        expect(stateFor(report, stale)).toBe("differs");
        expect(report.agreed).toBe(PROPAGATION_NODES.length - 1);
    });

    test("compares by value, not by the order the resolver listed them in", () => {
        // Round-robin records come back shuffled by design. Sorting happens in
        // the repository; this pins the contract that equal sets are equal.
        const answers = PROPAGATION_NODES.map((node) => answer(node.id, ["1.1.1.1", "2.2.2.2"]));
        const report = summarizePropagation("A", answers);

        expect(report.agreed).toBe(PROPAGATION_NODES.length);
    });

    test("separates a resolver that did not answer from one that answered nothing", () => {
        const [silent, blank, ...rest] = PROPAGATION_NODES;
        const answers = [
            answer(silent.id, [], false),
            answer(blank.id, []),
            ...rest.map((node) => answer(node.id, ["1.2.3.4"])),
        ];

        const report = summarizePropagation("A", answers);

        expect(stateFor(report, silent.id)).toBe("unreachable");
        expect(stateFor(report, blank.id)).toBe("empty");
        expect(report.answered).toBe(PROPAGATION_NODES.length - 2);
    });

    test("reports a node nobody asked as unreachable rather than dropping the row", () => {
        const report = summarizePropagation("A", [answer(PROPAGATION_NODES[0].id, ["1.2.3.4"])]);

        expect(report.nodes).toHaveLength(PROPAGATION_NODES.length);
        expect(report.total).toBe(PROPAGATION_NODES.length);
        expect(stateFor(report, PROPAGATION_NODES[1].id)).toBe("unreachable");
    });

    test("survives every resolver failing", () => {
        const report = summarizePropagation(
            "A",
            PROPAGATION_NODES.map((node) => answer(node.id, [], false)),
        );

        expect(report.consensus).toEqual([]);
        expect(report.agreed).toBe(0);
        expect(report.answered).toBe(0);
    });

    test("treats a name with no records as empty everywhere, not as disagreement", () => {
        const report = summarizePropagation("A", allAgreeing([]));

        expect(report.consensus).toEqual([]);
        expect(report.nodes.every((node) => node.state === "empty")).toBe(true);
    });

    test("breaks a tie deterministically, in node-table order", () => {
        const answers = PROPAGATION_NODES.map((node, index) =>
            answer(node.id, index % 2 === 0 ? ["1.1.1.1"] : ["2.2.2.2"]),
        );

        // Same input, same answer, every time — a report that changed between
        // two runs of an unchanged domain would be unusable as evidence.
        const first = summarizePropagation("A", answers);
        const second = summarizePropagation("A", answers);

        expect(first.consensus).toEqual(second.consensus);
        expect(first.consensus).toEqual(["1.1.1.1"]);
    });

    test("carries the record type it compared", () => {
        expect(summarizePropagation("AAAA", allAgreeing(["2606:4700::1111"])).type).toBe("AAAA");
    });

    test("keeps the TTL and the timing each node reported", () => {
        const report = summarizePropagation("A", [
            { id: PROPAGATION_NODES[0].id, ok: true, values: ["1.2.3.4"], ttl: 60, elapsedMs: 123 },
        ]);

        expect(report.nodes[0]).toMatchObject({ ttl: 60, elapsedMs: 123 });
    });
});

describe("propagationTone", () => {
    test("is good when every resolver that answered agreed", () => {
        expect(propagationTone(summarizePropagation("A", allAgreeing(["1.2.3.4"])))).toBe("good");
    });

    test("warns rather than alarms when resolvers disagree", () => {
        // A record changed ten minutes ago looks exactly like this, and it is
        // not a fault. Red here would train readers to ignore red.
        const report = summarizePropagation(
            "A",
            PROPAGATION_NODES.map((node, index) =>
                answer(node.id, index === 0 ? ["9.9.9.9"] : ["1.2.3.4"]),
            ),
        );

        expect(propagationTone(report)).toBe("warn");
    });

    test("stays idle when nothing answered, because silence is not a finding", () => {
        const report = summarizePropagation(
            "A",
            PROPAGATION_NODES.map((node) => answer(node.id, [], false)),
        );

        expect(propagationTone(report)).toBe("idle");
    });

    test("ignores unreachable nodes when judging agreement", () => {
        const report = summarizePropagation(
            "A",
            PROPAGATION_NODES.map((node, index) => answer(node.id, ["1.2.3.4"], index !== 0)),
        );

        expect(propagationTone(report)).toBe("good");
    });
});

describe("clusterByCountry", () => {
    test("puts every resolver in one country under a single pin", () => {
        const report = summarizePropagation("A", allAgreeing(["1.2.3.4"]));
        const clusters = clusterByCountry(report.nodes);

        const countries = new Set(PROPAGATION_NODES.map((node) => node.country));

        expect(clusters).toHaveLength(countries.size);

        for (const cluster of clusters) {
            const expected = PROPAGATION_NODES.filter(
                (node) => node.country === cluster.country,
            ).length;

            expect(cluster.nodes).toHaveLength(expected);
        }
    });

    test("accounts for every node exactly once", () => {
        const report = summarizePropagation("A", allAgreeing(["1.2.3.4"]));
        const placed = clusterByCountry(report.nodes).flatMap((cluster) => cluster.nodes);

        expect(placed).toHaveLength(report.nodes.length);
        expect(new Set(placed.map((node) => node.id)).size).toBe(report.nodes.length);
    });

    test("carries the country centroid onto the pin", () => {
        const report = summarizePropagation("A", allAgreeing(["1.2.3.4"]));
        const cluster = clusterByCountry(report.nodes).find((entry) => entry.country === "AU");
        const australia = countryLocation("AU")!;

        expect(cluster).toBeDefined();
        expect(cluster!.latitude).toBe(australia.latitude);
        expect(cluster!.longitude).toBe(australia.longitude);
    });

    test("flags a country where any resolver disagrees", () => {
        const odd = PROPAGATION_NODES[0];
        const report = summarizePropagation(
            "A",
            PROPAGATION_NODES.map((node) =>
                answer(node.id, node.id === odd.id ? ["9.9.9.9"] : ["1.2.3.4"]),
            ),
        );

        const cluster = clusterByCountry(report.nodes).find(
            (entry) => entry.country === odd.country,
        );

        expect(cluster!.tone).toBe("differs");
    });

    test("marks a country that answered nothing as silent, not as agreeing", () => {
        const report = summarizePropagation(
            "A",
            PROPAGATION_NODES.map((node) => answer(node.id, [], node.country !== "CN")),
        );

        const china = clusterByCountry(report.nodes).find((entry) => entry.country === "CN");

        expect(china!.tone).toBe("silent");
    });

    test("drops a pin it cannot place and keeps the rest", () => {
        const report = summarizePropagation("A", allAgreeing(["1.2.3.4"]));
        const withUnknown = [
            ...report.nodes,
            { ...report.nodes[0], id: "nowhere", country: "ZZ" },
        ] as const;

        const clusters = clusterByCountry(withUnknown);

        expect(clusters.some((cluster) => cluster.country === "ZZ")).toBe(false);
        expect(clusters.flatMap((cluster) => cluster.nodes)).toHaveLength(report.nodes.length);
    });
});
