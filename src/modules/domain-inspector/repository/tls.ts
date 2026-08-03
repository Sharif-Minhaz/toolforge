import "server-only";

import { connect } from "node:tls";

import { describeError, logEvent } from "@/modules/observability/domain/logger";
import { toCertificateReport, type PeerCertificateLike } from "../domain/certificate";
import { TLS_TIMEOUT_MS } from "../domain/constants";
import { isIpAddress } from "../domain/ip";
import type { CertificateReport, PanelResult } from "../types";

/**
 * One TLS handshake, carried far enough to read the certificate and no further.
 *
 * Two decisions worth knowing about:
 *
 * - **`rejectUnauthorized: false` is the point, not a shortcut.** A tool whose
 *   job is to report that a certificate expired, or was issued for a different
 *   name, cannot refuse to look at one. Nothing is sent over this socket and
 *   nothing that comes back is trusted — it is closed the moment the peer has
 *   presented its chain — so the usual reason for verifying does not apply.
 * - **The socket is opened to a validated address, with `servername` carrying
 *   the name.** Connecting to the hostname would resolve it a second time, and
 *   a name that answered with a public address a moment ago is free to answer
 *   with `127.0.0.1` on the next query. Pinning the address is what makes the
 *   check that was already done still true at connect time.
 */
export async function fetchCertificate(
    hostname: string,
    address: string,
    now: Date,
): Promise<PanelResult<CertificateReport>> {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (result: PanelResult<CertificateReport>) => {
            if (!settled) {
                settled = true;
                resolve(result);
            }
        };

        const socket = connect({
            host: address,
            port: 443,
            // SNI carries a name, never an address — RFC 6066 forbids the
            // literal, and Node refuses to send one.
            ...(isIpAddress(hostname) ? {} : { servername: hostname }),
            rejectUnauthorized: false,
            timeout: TLS_TIMEOUT_MS,
        });

        socket.once("secureConnect", () => {
            const certificate = socket.getPeerCertificate(true) as PeerCertificateLike | null;
            const cipher = socket.getCipher();
            const protocol = socket.getProtocol();

            // An empty object is what Node hands back when the peer presented
            // nothing at all, which is not the same as a bad certificate.
            if (certificate === null || Object.keys(certificate).length === 0) {
                socket.destroy();
                finish({ ok: false, reason: "tls_failed" });

                return;
            }

            finish({
                ok: true,
                data: toCertificateReport({
                    certificate,
                    hostname,
                    protocol,
                    cipher: cipher?.name ?? null,
                    now,
                }),
            });

            socket.destroy();
        });

        socket.once("timeout", () => {
            socket.destroy();
            finish({ ok: false, reason: "timeout" });
        });

        socket.once("error", (caught: Error) => {
            logEvent("warn", "domain_inspector.tls_failed", {
                hostname,
                error: describeError(caught),
            });

            socket.destroy();
            finish({ ok: false, reason: "tls_failed" });
        });

        socket.once("close", () => {
            finish({ ok: false, reason: "tls_failed" });
        });
    });
}
