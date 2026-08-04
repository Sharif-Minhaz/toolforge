import "server-only";

import { connect } from "node:net";

import { serviceName } from "../domain/ports";
import { PORT_TIMEOUT_MS, SCAN_CONCURRENCY } from "../domain/constants";
import type { IpVersion } from "@/modules/tools/types";
import type { PortResult } from "../types";

/**
 * A TCP connect scan, and nothing more.
 *
 * The socket is opened, the handshake is observed, and the socket is destroyed
 * without a byte being written or read. That is a deliberate ceiling on what
 * this tool is: no SYN scan (needs raw sockets and root, and exists to be
 * quieter than a real connection), no banner read, no version probe. What comes
 * back is whether a TCP handshake completed, which is the question, and the
 * service column is a static label rather than anything the far end said.
 */

/**
 * The three answers, and the errno that means each.
 *
 * `ECONNREFUSED` is the only one that proves a host is *there* and declining —
 * a reset came back, which took a live machine to send. Everything else is the
 * absence of an answer, and the honest word for that is `filtered`.
 */
function stateForError(code: string | undefined): PortResult["state"] {
    return code === "ECONNREFUSED" ? "closed" : "filtered";
}

function probePort(address: string, port: number, family: IpVersion): Promise<PortResult> {
    return new Promise((resolve) => {
        const startedAt = performance.now();
        const service = serviceName(port);
        let settled = false;

        const socket = connect({
            port,
            // The address, never the hostname. Re-resolving here would hand the
            // decision back to whoever controls the record, and a one-second
            // TTL is all it would take to answer publicly for the guard and
            // privately for the connection.
            host: address,
            family,
            // The address is a literal, so nothing should reach a resolver —
            // this makes that a guarantee rather than an expectation.
            lookup: (_hostname, _options, callback) => {
                callback(new Error("hostname lookup is not permitted here"), "", family);
            },
        });

        function finish(state: PortResult["state"]) {
            if (settled) {
                return;
            }

            settled = true;
            socket.destroy();
            resolve({
                port,
                state,
                latencyMs: state === "filtered" ? null : Math.round(performance.now() - startedAt),
                service,
            });
        }

        socket.setTimeout(PORT_TIMEOUT_MS);
        // Nothing is written and nothing is read. A completed handshake is the
        // whole finding.
        socket.once("connect", () => finish("open"));
        socket.once("timeout", () => finish("filtered"));
        socket.once("error", (error: NodeJS.ErrnoException) => finish(stateForError(error.code)));
    });
}

/**
 * Works the list with a fixed number of sockets open at once.
 *
 * Not `Promise.all` over every port: 128 simultaneous SYNs look exactly like a
 * flood from the far end, and that is the behaviour that gets a server's
 * address blocked by the networks it most needs to reach. Not sequential
 * either, which would take three minutes.
 *
 * `deadline` is an absolute instant rather than a duration because the pool
 * outlives any one probe. Once it passes, every port still unvisited is
 * reported as `filtered` — which is what an unsent probe and an unanswered one
 * amount to for the reader, and is far better than a serverless function being
 * killed with no result at all.
 */
export async function probePorts(
    address: string,
    ports: readonly number[],
    family: IpVersion,
    deadline: number,
): Promise<readonly PortResult[]> {
    const results: PortResult[] = [];
    let next = 0;

    async function worker(): Promise<void> {
        while (next < ports.length) {
            const index = next;
            next += 1;

            const port = ports[index];

            if (performance.now() >= deadline) {
                results.push({
                    port,
                    state: "filtered",
                    latencyMs: null,
                    service: serviceName(port),
                });
                continue;
            }

            results.push(await probePort(address, port, family));
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(SCAN_CONCURRENCY, ports.length) }, () => worker()),
    );

    return results;
}
