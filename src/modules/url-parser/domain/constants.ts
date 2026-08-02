import type { UrlParserView } from "../types";

/**
 * Generous next to the 2,048 characters most servers and browsers agree on,
 * because a signed download link or an OAuth callback routinely runs longer.
 * Past this the input stops being a URL somebody meant to inspect.
 */
export const MAX_URL_INPUT_LENGTH = 8192;

/** The breakdown is what "parse" means, so it is what the page opens on. */
export const DEFAULT_URL_PARSER_VIEW: UrlParserView = "params";

/** Carries every part at once, so one click fills the whole table. */
export const SAMPLE_URL =
    "https://team:secret@api.example.com:8443/v2/search?q=url+parser&page=2&sort=desc#results";
