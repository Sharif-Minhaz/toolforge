import { licenseUrl, TECHNOLOGY_SIGNATURES, type SignatureRule } from "./fingerprints";
import type { HeaderMap } from "./headers";
import { TECHNOLOGY_CATEGORIES, type TechnologyMatch } from "../types";

/**
 * Runs the signature table over everything that was collected about a site.
 *
 * Pure, and total: a missing panel is an empty string or an empty list, never a
 * reason to stop. A site whose TLS handshake failed still gets its mail and DNS
 * providers named from records that did answer.
 */

export type DetectionInput = {
    readonly headers: HeaderMap;
    /** Cookie *names* only. A cookie's value is the visitor's, not evidence. */
    readonly cookieNames: readonly string[];
    readonly html: string;
    readonly generator: string | null;
    readonly mailExchangers: readonly string[];
    readonly nameservers: readonly string[];
};

/** The captured version, when a rule bothered to capture one. */
function captureVersion(matched: RegExpExecArray | null): string | null {
    const version = matched?.[1];

    return version !== undefined && version.length > 0 ? version : null;
}

function firstMatch(
    values: readonly string[],
    pattern: RegExp,
): { readonly value: string; readonly version: string | null } | null {
    for (const value of values) {
        const matched = pattern.exec(value);

        if (matched !== null) {
            return { value, version: captureVersion(matched) };
        }
    }

    return null;
}

type RuleHit = {
    readonly key: string | null;
    readonly version: string | null;
};

function evaluate(rule: SignatureRule, input: DetectionInput): RuleHit | null {
    switch (rule.source) {
        case "header": {
            const value = rule.key === undefined ? undefined : input.headers[rule.key];

            if (value === undefined) {
                return null;
            }

            const matched = rule.pattern.exec(value);

            return matched === null
                ? null
                : { key: rule.key ?? null, version: captureVersion(matched) };
        }

        case "cookie": {
            const hit = input.cookieNames.find(
                (name) => name.toLowerCase() === rule.key?.toLowerCase(),
            );

            return hit === undefined ? null : { key: hit, version: null };
        }

        case "generator": {
            if (input.generator === null) {
                return null;
            }

            const matched = rule.pattern.exec(input.generator);

            return matched === null ? null : { key: null, version: captureVersion(matched) };
        }

        case "html": {
            const matched = rule.pattern.exec(input.html);

            return matched === null ? null : { key: null, version: captureVersion(matched) };
        }

        case "mx": {
            const hit = firstMatch(input.mailExchangers, rule.pattern);

            return hit === null ? null : { key: hit.value, version: hit.version };
        }

        case "ns": {
            const hit = firstMatch(input.nameservers, rule.pattern);

            return hit === null ? null : { key: hit.value, version: hit.version };
        }
    }
}

const CATEGORY_ORDER = new Map(
    TECHNOLOGY_CATEGORIES.map((category, index) => [category, index] as const),
);

export function detectTechnologies(input: DetectionInput): readonly TechnologyMatch[] {
    const matches: TechnologyMatch[] = [];

    for (const signature of TECHNOLOGY_SIGNATURES) {
        for (const rule of signature.rules) {
            const hit = evaluate(rule, input);

            if (hit === null) {
                continue;
            }

            matches.push({
                id: signature.id,
                name: signature.name,
                category: signature.category,
                license: signature.license,
                licenseUrl: licenseUrl(signature.license),
                version: hit.version,
                evidence: { source: rule.source, key: hit.key },
            });

            // The first rule that fires is the evidence shown. Later rules for
            // the same technology would only restate it less specifically.
            break;
        }
    }

    return matches.toSorted((a, b) => {
        const byCategory =
            (CATEGORY_ORDER.get(a.category) ?? 0) - (CATEGORY_ORDER.get(b.category) ?? 0);

        return byCategory !== 0 ? byCategory : a.name.localeCompare(b.name, "en");
    });
}
