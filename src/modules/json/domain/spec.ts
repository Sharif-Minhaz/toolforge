import type { JsonSpec } from "../types";

/**
 * What actually differs between the four published grammars, as far as a
 * validator can check it.
 *
 * RFC 4627 (2006) defined a JSON *text* as an object or an array, so a bare
 * string or number at the top level is not a document under it. RFC 7159 (2014)
 * lifted that restriction and ECMA-404 was published alongside it describing the
 * same grammar, which is why those two behave identically here. RFC 8259 (2017)
 * kept 7159's grammar and tightened interchange: a string carrying an unpaired
 * surrogate is not valid Unicode and cannot be encoded as UTF-8, so it is an
 * error rather than a warning.
 */
export function requiresContainerRoot(spec: JsonSpec): boolean {
    return spec === "rfc4627";
}

export function rejectsUnpairedSurrogates(spec: JsonSpec): boolean {
    return spec === "rfc8259";
}
