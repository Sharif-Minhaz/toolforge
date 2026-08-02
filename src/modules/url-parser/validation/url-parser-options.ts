import { z } from "zod";

import { MAX_URL_INPUT_LENGTH } from "../domain/constants";
import { URL_PARSER_VIEWS } from "../types";

export const urlParserViewSchema = z.enum(URL_PARSER_VIEWS);

export const urlInputSchema = z.string().max(MAX_URL_INPUT_LENGTH);

/**
 * Search-param shape for `/tools/url-parser?url=https%3A%2F%2Fexample.com&view=params`.
 * Each field catches on its own, so one malformed value degrades to the default
 * instead of throwing the whole page away.
 */
export const urlParserSearchParamsSchema = z.object({
    url: urlInputSchema.optional().catch(undefined),
    view: urlParserViewSchema.optional().catch(undefined),
});
