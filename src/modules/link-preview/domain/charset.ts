/**
 * Which character set a fetched page is in, decided the way the HTML standard
 * decides it — byte-order mark, then the `Content-Type` header, then a
 * `<meta charset>` in the first kilobyte — and nothing cleverer.
 *
 * It matters more here than for most fetches. A Japanese or Chinese site that
 * still serves Shift_JIS or GBK, decoded as UTF-8, produces an `og:title` of
 * replacement characters, and the debugger would then report that the site's
 * preview is garbage when it is the debugger that is.
 *
 * Pure: this names the label, and `repository/fetch-page.ts` decodes with it,
 * on Node, whose `TextDecoder` knows every label the standard lists. Bun's
 * knows a handful, which is why the decoding is not done here and not tested
 * under `bun test`.
 */

export const DEFAULT_CHARSET = "utf-8";

/** How far into the document a `<meta charset>` may appear and still count. */
export const CHARSET_SNIFF_BYTES = 1024;

function labelFrom(text: string): string | null {
    const matched = /charset\s*=\s*["']?\s*([a-z0-9_.:-]+)/i.exec(text);

    return matched === null ? null : matched[1].toLowerCase();
}

/**
 * @param contentType the response's `Content-Type`, or `null`.
 * @param prefix the first bytes of the body.
 */
export function sniffCharset(contentType: string | null, prefix: Uint8Array): string {
    if (prefix[0] === 0xef && prefix[1] === 0xbb && prefix[2] === 0xbf) {
        return "utf-8";
    }

    if (prefix[0] === 0xfe && prefix[1] === 0xff) {
        return "utf-16be";
    }

    if (prefix[0] === 0xff && prefix[1] === 0xfe) {
        return "utf-16le";
    }

    const fromHeader = contentType === null ? null : labelFrom(contentType);

    if (fromHeader !== null) {
        return fromHeader;
    }

    // Latin-1 is a lossless byte-to-character mapping, so the ASCII markup the
    // declaration is written in reads correctly whatever the page's real set.
    let head = "";

    for (let index = 0; index < Math.min(prefix.length, CHARSET_SNIFF_BYTES); index += 1) {
        head += String.fromCharCode(prefix[index]);
    }

    const meta = /<meta\b[^>]*charset\s*=\s*["']?\s*([a-z0-9_.:-]+)/i.exec(head);

    return meta === null ? DEFAULT_CHARSET : meta[1].toLowerCase();
}
