import type {
    DecodedJwt,
    JwtClaims,
    JwtDecodeFailure,
    JwtDecodeResult,
    JwtSegmentName,
} from "../types";
import { decodeBase64UrlToBytes, decodeBase64UrlToText } from "./base64url";
import { JSON_INDENT, MAX_JWT_INPUT_LENGTH } from "./constants";
import { isJsonObject } from "./json";

/** A JWS carries three parts; a JWE carries five and holds nothing readable. */
const JWS_SEGMENT_COUNT = 3;
const JWE_SEGMENT_COUNT = 5;

const BEARER_PREFIX = /^bearer\s+/i;

/**
 * Tokens contain no whitespace, so any that survives a paste — wrapped terminal
 * output, a trailing newline — is noise. A copied `Authorization` header keeps
 * its scheme, which is worth absorbing rather than reporting as malformed.
 */
export function normalizeToken(input: string): string {
    return input.replace(BEARER_PREFIX, "").replace(/\s+/g, "");
}

function fail(reason: JwtDecodeFailure["reason"], segment?: JwtSegmentName): JwtDecodeFailure {
    return segment === undefined ? { ok: false, reason } : { ok: false, reason, segment };
}

type SegmentParse = { readonly ok: true; readonly claims: JwtClaims } | JwtDecodeFailure;

function parseSegment(segment: string, name: JwtSegmentName): SegmentParse {
    const decoded = decodeBase64UrlToText(segment);

    if (!decoded.ok) {
        return fail("invalid_base64", name);
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(decoded.text);
    } catch {
        return fail("invalid_json", name);
    }

    if (!isJsonObject(parsed)) {
        return fail("not_an_object", name);
    }

    return { ok: true, claims: parsed };
}

function readAlgorithm(header: JwtClaims): string | null {
    return typeof header.alg === "string" ? header.alg : null;
}

/**
 * Reads a token without checking its signature — the only half of the job that
 * is pure and synchronous, so the first paint already carries the result.
 * Authenticity is a separate question answered by `verifyJwtSignature`.
 */
export function decodeJwt(input: string): JwtDecodeResult {
    const token = normalizeToken(input);

    if (token.length === 0) {
        return fail("empty");
    }

    if (token.length > MAX_JWT_INPUT_LENGTH) {
        return fail("too_large");
    }

    const parts = token.split(".");

    if (parts.length === JWE_SEGMENT_COUNT) {
        return { ok: false, reason: "encrypted_token", segmentCount: parts.length };
    }

    if (parts.length !== JWS_SEGMENT_COUNT) {
        return { ok: false, reason: "segment_count", segmentCount: parts.length };
    }

    const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

    const header = parseSegment(headerSegment, "header");

    if (!header.ok) {
        return header;
    }

    const payload = parseSegment(payloadSegment, "payload");

    if (!payload.ok) {
        return payload;
    }

    // An `alg: none` token ends with an empty third segment, which is legal
    // here and flagged by the security pass rather than rejected outright.
    if (!decodeBase64UrlToBytes(signatureSegment).ok) {
        return fail("invalid_base64", "signature");
    }

    return {
        ok: true,
        token,
        segments: {
            header: headerSegment,
            payload: payloadSegment,
            signature: signatureSegment,
        },
        header: header.claims,
        payload: payload.claims,
        headerJson: JSON.stringify(header.claims, null, JSON_INDENT),
        payloadJson: JSON.stringify(payload.claims, null, JSON_INDENT),
        algorithm: readAlgorithm(header.claims),
    } satisfies DecodedJwt;
}
