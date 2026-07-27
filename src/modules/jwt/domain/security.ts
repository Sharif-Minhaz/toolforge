import type { DecodedJwt, JwtClaims, JwtFinding, JwtFindingSeverity } from "../types";
import { isUnsecuredAlgorithm } from "./algorithms";
import { inspectTimeClaims } from "./claims";
import {
    LONG_LIVED_TOKEN_DAYS,
    REMOTE_KEY_HEADERS,
    SECONDS_PER_DAY,
    SENSITIVE_CLAIM_FRAGMENTS,
} from "./constants";
import { isJsonObject } from "./json";

/** How far a nested payload is walked when hunting for exposed secrets. */
const MAX_CLAIM_DEPTH = 4;

const SEVERITY_ORDER: Record<JwtFindingSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
};

function looksSensitive(name: string): boolean {
    const normalized = name.toLowerCase();

    return SENSITIVE_CLAIM_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Claim paths whose names suggest a credential is riding along in a payload
 * that is only encoded, never encrypted. Nested objects are walked because the
 * habit is to bury these one level down, in a `user` or `context` claim.
 */
function findSensitivePaths(value: unknown, prefix: string, depth: number): string[] {
    if (depth > MAX_CLAIM_DEPTH || !isJsonObject(value)) {
        return [];
    }

    return Object.entries(value).flatMap(([name, nested]) => {
        const path = prefix === "" ? name : `${prefix}.${name}`;
        const deeper = findSensitivePaths(nested, path, depth + 1);

        return looksSensitive(name) ? [path, ...deeper] : deeper;
    });
}

function isNestedJwt(header: JwtClaims): boolean {
    return typeof header.cty === "string" && header.cty.toLowerCase() === "jwt";
}

/**
 * Everything worth flagging about a token that could be read without a key.
 * Ordered most severe first so the panel leads with what matters; the reference
 * instant is injected, so the same token always reports the same way in tests.
 */
export function inspectSecurity(decoded: DecodedJwt, now: Date): readonly JwtFinding[] {
    const findings: JwtFinding[] = [];
    const { header, payload } = decoded;

    if (isUnsecuredAlgorithm(decoded.algorithm)) {
        findings.push({ code: "algNone", severity: "critical", subjects: [] });
    } else if (decoded.algorithm === null) {
        findings.push({ code: "algMissing", severity: "critical", subjects: [] });
    }

    const remoteKeyHeaders = REMOTE_KEY_HEADERS.filter((parameter) => parameter in header);

    if (remoteKeyHeaders.length > 0) {
        findings.push({
            code: "remoteKeyHeader",
            severity: "critical",
            subjects: remoteKeyHeaders,
        });
    }

    const sensitive = findSensitivePaths(payload, "", 0);

    if (sensitive.length > 0) {
        findings.push({ code: "sensitiveClaim", severity: "critical", subjects: sensitive });
    }

    const timeClaims = inspectTimeClaims(payload, now);
    const expiry = timeClaims.find((insight) => insight.claim === "exp");
    const notBefore = timeClaims.find((insight) => insight.claim === "nbf");

    if (expiry?.state === "expired") {
        findings.push({ code: "expired", severity: "warning", subjects: ["exp"] });
    }

    if (notBefore?.state === "notYetValid") {
        findings.push({ code: "notYetValid", severity: "warning", subjects: ["nbf"] });
    }

    if (expiry === undefined) {
        findings.push({ code: "missingExp", severity: "warning", subjects: [] });
    } else if (expiry.offsetSeconds > LONG_LIVED_TOKEN_DAYS * SECONDS_PER_DAY) {
        findings.push({ code: "longLived", severity: "info", subjects: ["exp"] });
    }

    if (isNestedJwt(header)) {
        findings.push({ code: "nestedToken", severity: "info", subjects: ["cty"] });
    }

    return findings.toSorted((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
