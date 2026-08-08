import { bytesToBase64 } from "@/modules/tools/domain/base64";
import { PEM_LINE_LENGTH } from "./constants";
import { PEM_LABELS, type PemLabel, type RsaKeyFormat, type RsaKeyKind } from "../types";

/**
 * RFC 7468 textual encoding: a header line, the base64 body wrapped at 64
 * characters, and a footer. Every line ends with LF, including the last one —
 * OpenSSL writes the trailing newline and a great many readers of these files
 * are line-oriented shell tools that expect it.
 */
export function toPem(label: PemLabel, der: Uint8Array): string {
    const body = wrapBase64(bytesToBase64(der));

    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

export function wrapBase64(base64: string, width = PEM_LINE_LENGTH): string {
    const lines: string[] = [];

    for (let index = 0; index < base64.length; index += width) {
        lines.push(base64.slice(index, index + width));
    }

    return lines.join("\n");
}

/**
 * Which of the four headers a key gets, from the two things that decide it.
 *
 * The pairing is not symmetric in its naming and that trips people up: PKCS#8's
 * private half says `PRIVATE KEY` while its public half says `PUBLIC KEY` and is
 * strictly a SubjectPublicKeyInfo, which is a different specification again.
 * PKCS#1's two halves are the ones that read as a matching pair.
 */
export function pemLabelFor(format: RsaKeyFormat, kind: RsaKeyKind): PemLabel {
    if (format === "pkcs8") {
        return kind === "public" ? PEM_LABELS.spki : PEM_LABELS.pkcs8;
    }

    return kind === "public" ? PEM_LABELS.pkcs1Public : PEM_LABELS.pkcs1Private;
}
