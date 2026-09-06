import { z } from "zod";

import { MAX_DUMP_ROWS, MAX_MCP_INPUT_BYTES, MAX_SEARCH_QUERY_LENGTH } from "../domain/constants";
import { ENDIANNESS, HEX_COLUMNS, SEARCH_MODES } from "../types";

export const endiannessSchema = z.enum(ENDIANNESS);
export const hexColumnSchema = z.enum(HEX_COLUMNS);
export const searchModeSchema = z.enum(SEARCH_MODES);

export const searchQuerySchema = z.string().max(MAX_SEARCH_QUERY_LENGTH);

/** A byte offset into a document. Bounded by the document, not by the schema. */
export const byteOffsetSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const dumpRowsSchema = z.number().int().min(1).max(MAX_DUMP_ROWS);

/**
 * Bytes arriving over MCP, Base64-encoded.
 *
 * The ceiling is on the *encoded* length because that is what can be checked
 * before decoding — four Base64 characters carry three bytes, so this refuses
 * anything that would decode past `MAX_MCP_INPUT_BYTES` without allocating it
 * first.
 */
export const base64BytesSchema = z.string().max(Math.ceil(MAX_MCP_INPUT_BYTES / 3) * 4);

/**
 * Search-param shape for `/tools/hex-editor?endian=big&offset=0x200`.
 *
 * `offset` stays a string: `0x200` is one of the three forms Go To accepts, and
 * turning it into a number here would mean writing that parser twice. The page
 * hands it to `parseOffsetInput` once a file is open — there is nothing to jump
 * into before then.
 *
 * Every field catches on its own, so a link with one bad value opens on the
 * defaults instead of throwing the page away.
 */
export const hexEditorSearchParamsSchema = z.object({
    endian: endiannessSchema.optional().catch(undefined),
    column: hexColumnSchema.optional().catch(undefined),
    offset: z.string().max(32).optional().catch(undefined),
    mode: searchModeSchema.optional().catch(undefined),
});

export type HexEditorSearchParams = z.output<typeof hexEditorSearchParamsSchema>;
