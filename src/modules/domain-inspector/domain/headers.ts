import { SECURITY_HEADERS, type SecurityGrade, type SecurityHeader } from "../types";

/**
 * Response headers, read the same way every time.
 *
 * Header names are case-insensitive on the wire, so everything here works over
 * a lowercased map. The repository builds that map once; nothing downstream has
 * to remember the rule.
 */

export type HeaderMap = Readonly<Record<string, string>>;

export function toHeaderMap(entries: Iterable<readonly [string, string]>): HeaderMap {
    const map: Record<string, string> = {};

    for (const [name, value] of entries) {
        map[name.toLowerCase()] = value;
    }

    return map;
}

export function readSecurityHeaders(headers: HeaderMap): readonly SecurityHeader[] {
    return SECURITY_HEADERS.map((name) => ({ name, value: headers[name] ?? null }));
}

/**
 * A blunt count, and deliberately so. Six headers, each either sent or not:
 * five or more is `strong`, two to four is `partial`, and anything less is
 * `weak`. Grading the *contents* — whether a CSP is meaningfully restrictive,
 * whether an HSTS max-age is long enough — is a different tool, and pretending
 * otherwise here would put a confident letter on a guess.
 */
export function gradeSecurityHeaders(headers: readonly SecurityHeader[]): SecurityGrade {
    const present = headers.filter((header) => header.value !== null).length;

    if (present >= 5) {
        return "strong";
    }

    return present >= 2 ? "partial" : "weak";
}
