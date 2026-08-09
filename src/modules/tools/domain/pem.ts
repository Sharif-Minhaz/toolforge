import { base64ToBytes, bytesToBase64 } from "./base64";
import type { CipherBytes } from "../types";

/**
 * RFC 7468 textual encoding — the `-----BEGIN …-----` wrapper around any DER
 * structure.
 *
 * Deliberately generic. The label is a parameter rather than an enum, because
 * PEM is a container format and nothing here needs to know whether it is holding
 * an RSA key, a certificate or a certificate request. What each label means for
 * an RSA key lives in `rsa-der.ts`, which is where the rest of that knowledge
 * already is.
 */

/** PEM bodies wrap at 64 base64 characters, per RFC 7468. */
export const PEM_LINE_LENGTH = 64;

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;

/**
 * Writes a block. Every line ends with LF, including the last one — OpenSSL
 * writes the trailing newline, and a great many readers of these files are
 * line-oriented shell tools that expect it.
 */
export function toPem(label: string, der: Uint8Array): string {
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

export type ParsedPem = {
    readonly label: string;
    readonly der: CipherBytes;
};

/**
 * Reads the first block out of a pasted string.
 *
 * The header and the footer have to name the same thing — the backreference in
 * the pattern is doing that — because a block whose two ends disagree is a
 * paste that lost its middle, and reading it as though the header were right
 * would import half of one key under the name of another.
 *
 * Surrounding noise is tolerated on purpose. What arrives in this box is
 * whatever the reader selected in a terminal or an editor, which routinely
 * carries a shell prompt above it and a blank line below.
 */
export function parsePem(text: string): ParsedPem | null {
    const matched = PEM_BLOCK.exec(text);

    if (matched === null) {
        return null;
    }

    const der = base64ToBytes(matched[2]);

    return der === null ? null : { label: matched[1], der };
}

/** Whether the text looks like a PEM block at all, for picking a reader. */
export function looksLikePem(text: string): boolean {
    return text.includes("-----BEGIN ");
}
