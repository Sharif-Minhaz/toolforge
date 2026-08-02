/**
 * The pieces a URL is broken into, in the order the tool lists them. Declared
 * as a literal union so `parts.<id>.label` stays statically checkable.
 */
export const URL_PART_IDS = [
    "protocol",
    "username",
    "password",
    "hostname",
    "port",
    "path",
    "query",
    "fragment",
    "origin",
] as const;

export type UrlPartId = (typeof URL_PART_IDS)[number];

/** Every part, empty string where the URL carries nothing for it. */
export type UrlParts = Readonly<Record<UrlPartId, string>>;

/** One query-string pair, already percent-decoded. */
export type UrlQueryParam = {
    readonly key: string;
    readonly value: string;
};

export type UrlParseFailureReason =
    "empty" | "too_long" | "relative_path" | "missing_scheme" | "invalid_url";

export type UrlParseFailure = {
    readonly ok: false;
    readonly reason: UrlParseFailureReason;
    /**
     * Set only on `missing_scheme`: the same text with `https://` in front,
     * which does parse. The UI offers it as a one-click repair rather than
     * rewriting what was typed.
     */
    readonly suggestion?: string;
};

export type UrlParseSuccess = {
    readonly ok: true;
    /** WHATWG-normalised: lowercased scheme and host, default port dropped. */
    readonly href: string;
    readonly parts: UrlParts;
    readonly params: readonly UrlQueryParam[];
    /** True when normalising changed the text that was typed. */
    readonly normalized: boolean;
};

export type UrlParseResult = UrlParseSuccess | UrlParseFailure;

/** Which half of the workbench is showing. Also the `view` search param. */
export const URL_PARSER_VIEWS = ["params", "detail"] as const;

export type UrlParserView = (typeof URL_PARSER_VIEWS)[number];

export type UrlParserExportRequest = {
    readonly parsed: UrlParseSuccess;
    readonly generatedAt: Date;
};
