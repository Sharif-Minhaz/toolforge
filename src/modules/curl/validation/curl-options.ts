import { z } from "zod";

import { MAX_SHARED_INPUT_LENGTH } from "../domain/constants";
import {
    CODE_STYLES,
    CODE_TARGETS,
    CURL_DIRECTIONS,
    FETCH_RUNTIMES,
    HEADERS_STYLES,
    INDENT_WIDTHS,
    SHELL_DIALECTS,
} from "../types";

export const curlDirectionSchema = z.enum(CURL_DIRECTIONS);
export const codeTargetSchema = z.enum(CODE_TARGETS);
export const fetchRuntimeSchema = z.enum(FETCH_RUNTIMES);
export const codeStyleSchema = z.enum(CODE_STYLES);
export const headersStyleSchema = z.enum(HEADERS_STYLES);
export const indentWidthSchema = z.enum(INDENT_WIDTHS);
export const shellDialectSchema = z.enum(SHELL_DIALECTS);

export const curlInputSchema = z.string().max(MAX_SHARED_INPUT_LENGTH);

/**
 * Search-param shape for `/tools/curl?direction=curlToCode&target=axios`.
 * Each field catches on its own, so one malformed value degrades to its default
 * instead of throwing the whole page away.
 */
export const curlSearchParamsSchema = z.object({
    direction: curlDirectionSchema.optional().catch(undefined),
    input: curlInputSchema.optional().catch(undefined),
    target: codeTargetSchema.optional().catch(undefined),
    runtime: fetchRuntimeSchema.optional().catch(undefined),
    style: codeStyleSchema.optional().catch(undefined),
    shell: shellDialectSchema.optional().catch(undefined),
});
