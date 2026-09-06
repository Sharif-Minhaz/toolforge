import { z } from "zod";

import {
    MAX_DUMP_ROWS,
    MAX_MCP_INPUT_BYTES,
    BYTES_PER_ROW,
    DEFAULT_ENDIANNESS,
    DEFAULT_SEARCH_MODE,
    INSPECTOR_WINDOW_BYTES,
    MAX_SEARCH_MATCHES,
} from "@/modules/hex-editor/domain/constants";
import {
    byteToAscii,
    byteToHex,
    formatHexDump,
    formatOffset,
} from "@/modules/hex-editor/domain/format";
import { readInspector } from "@/modules/hex-editor/domain/inspector";
import { findMatches, parseSearchQuery } from "@/modules/hex-editor/domain/search";
import {
    base64BytesSchema,
    byteOffsetSchema,
    dumpRowsSchema,
    endiannessSchema,
    searchModeSchema,
    searchQuerySchema,
} from "@/modules/hex-editor/validation/hex-editor";
import { base64ToBytes } from "@/modules/tools/domain/base64";

import { defineMcpTool } from "../domain/define-tool";
import { refuse, refuseWithReason, succeed } from "../domain/result";

/**
 * The three questions the Hex Editor answers, for a caller with no grid.
 *
 * The tool on the page reads a file off the reader's disk; an MCP caller has no
 * disk here, so bytes arrive Base64-encoded in the request. That is the only
 * difference — every one of these calls the same domain function the grid does,
 * and none of them reimplements a byte.
 *
 * Offline, all three: nothing leaves this process, and the bytes are gone when
 * the call returns.
 */

const bytesArgument = base64BytesSchema.describe(
    "The bytes to read, Base64-encoded. At most 2 MiB once decoded",
);

/** Decoded once, with the same refusal wherever the decode fails. */
function decode(encoded: string) {
    const bytes = base64ToBytes(encoded);

    if (bytes === null) {
        return {
            ok: false as const,
            outcome: refuse("invalid_base64", "The `bytes` argument is not valid Base64."),
        };
    }

    if (bytes.length === 0) {
        return { ok: false as const, outcome: refuseWithReason("Hex editor", "empty_file") };
    }

    if (bytes.length > MAX_MCP_INPUT_BYTES) {
        return {
            ok: false as const,
            outcome: refuseWithReason("Hex editor", "too_large", {
                bytes: bytes.length,
                limit: MAX_MCP_INPUT_BYTES,
            }),
        };
    }

    return { ok: true as const, bytes };
}

export const hexEditorDumpTool = defineMcpTool({
    toolId: "hex-editor",
    verb: "dump",
    title: "Dump bytes as hex",
    description:
        "Write a run of bytes as a classic hex dump: an eight-digit offset, sixteen uppercase hex bytes, and the same bytes as ASCII with unprintable ones shown as dots. Reads a window of the input rather than all of it, so a large blob can be walked a page at a time. Use it to identify a file from its signature, to check padding and alignment, or to see what is actually in a payload rather than what it decodes to.",
    kind: "offline",
    inputSchema: z.object({
        bytes: bytesArgument,
        offset: byteOffsetSchema
            .default(0)
            .describe("Byte offset the dump starts at. Rounded down to a row boundary"),
        rows: dumpRowsSchema.default(32).describe("How many 16-byte rows to write, at most 512"),
    }),
    run: ({ bytes: encoded, offset, rows }) => {
        const decoded = decode(encoded);

        if (!decoded.ok) {
            return decoded.outcome;
        }

        const { bytes } = decoded;

        if (offset >= bytes.length) {
            return refuseWithReason("Hex editor", "out_of_range", {
                offset,
                length: bytes.length,
            });
        }

        // Rounded to a row so the offsets in the dump are the ones a reader
        // would see in the grid rather than a window shifted by three bytes.
        const start = Math.floor(offset / BYTES_PER_ROW) * BYTES_PER_ROW;
        const end = Math.min(bytes.length, start + rows * BYTES_PER_ROW);
        const window = bytes.subarray(start, end);

        return succeed(`${end - start} bytes from 0x${formatOffset(start)} of ${bytes.length}.`, {
            dump: formatHexDump(window, start),
            hex: [...window].map(byteToHex).join(" "),
            ascii: [...window].map(byteToAscii).join(""),
            startOffset: start,
            endOffset: end,
            byteLength: bytes.length,
            // What a caller cannot see but needs to page: whether asking
            // again from `endOffset` would return anything.
            hasMore: end < bytes.length,
        });
    },
});

export const hexEditorInspectTool = defineMcpTool({
    toolId: "hex-editor",
    verb: "inspect",
    title: "Decode bytes at an offset",
    description:
        "Read the bytes at one offset as every type they could be: signed and unsigned integers at 8, 16, 24, 32 and 64 bits, half, single and double floats, the byte in binary and octal, ASCII, the first UTF-8 code point, a UTF-16 code unit, and a GUID. Byte order is chosen per call and changes most of the answers — the same four bytes are 67305985 little-endian and 16909060 big-endian. A reading the input has too few bytes left for comes back null rather than being omitted.",
    kind: "offline",
    inputSchema: z.object({
        bytes: bytesArgument,
        offset: byteOffsetSchema.default(0).describe("Byte offset to read from"),
        endian: endiannessSchema
            .default(DEFAULT_ENDIANNESS)
            .describe(
                "Which end of a multi-byte value comes first. 'little' is x86 and ARM; 'big' is most network protocols and RFC 4122 GUIDs",
            ),
    }),
    run: ({ bytes: encoded, offset, endian }) => {
        const decoded = decode(encoded);

        if (!decoded.ok) {
            return decoded.outcome;
        }

        const { bytes } = decoded;

        if (offset >= bytes.length) {
            return refuseWithReason("Hex editor", "out_of_range", {
                offset,
                length: bytes.length,
            });
        }

        const window = bytes.subarray(offset, offset + INSPECTOR_WINDOW_BYTES);
        const readings = readInspector(window, endian);

        return succeed(
            `${readings.filter((reading) => reading.value !== null).length} readings at 0x${formatOffset(offset)}, ${endian}-endian.`,
            {
                offset,
                endian,
                byteLength: bytes.length,
                bytesAvailable: window.length,
                readings: readings.map((reading) => ({
                    type: reading.label,
                    value: reading.value,
                    width: reading.width,
                })),
            },
        );
    },
});

export const hexEditorFindTool = defineMcpTool({
    toolId: "hex-editor",
    verb: "find",
    title: "Find bytes in a blob",
    description:
        "Find every offset a run of bytes occurs at. The needle is written either as text — one byte per character — or as hexadecimal, where spaces and commas between bytes are ignored so a pasted dump works as it stands. Overlapping occurrences are all reported. Stops after 1000 matches and says so.",
    kind: "offline",
    inputSchema: z.object({
        bytes: bytesArgument,
        query: searchQuerySchema.describe("What to look for, read according to `mode`"),
        mode: searchModeSchema
            .default(DEFAULT_SEARCH_MODE)
            .describe(
                "'ascii' reads the query as one byte per character; 'hex' reads it as hexadecimal byte pairs",
            ),
    }),
    run: ({ bytes: encoded, query, mode }) => {
        const decoded = decode(encoded);

        if (!decoded.ok) {
            return decoded.outcome;
        }

        const parsed = parseSearchQuery(query, mode);

        if (!parsed.ok) {
            return refuseWithReason("Hex editor", parsed.reason, { mode });
        }

        const { bytes } = decoded;
        const found = findMatches(
            (index) => bytes[index],
            bytes.length,
            parsed.bytes,
            MAX_SEARCH_MATCHES,
        );

        return succeed(
            found.offsets.length === 0
                ? "No matches."
                : `${found.offsets.length} match${found.offsets.length === 1 ? "" : "es"}, first at 0x${formatOffset(found.offsets[0])}.`,
            {
                mode,
                needle: [...parsed.bytes].map(byteToHex).join(" "),
                needleLength: parsed.bytes.length,
                byteLength: bytes.length,
                matchCount: found.offsets.length,
                offsets: [...found.offsets],
                truncated: found.truncated,
            },
        );
    },
});
