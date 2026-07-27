import type { JwtAlgorithm } from "../types";
import { JSON_INDENT } from "./constants";
import { parseJsonObject } from "./json";

export function readAlgorithmFromHeaderJson(headerJson: string): string | null {
    const parsed = parseJsonObject(headerJson);

    if (!parsed.ok || typeof parsed.value.alg !== "string") {
        return null;
    }

    return parsed.value.alg;
}

/**
 * Rewrites `alg` in an editable header, keeping every other parameter and the
 * original key order. Unparseable text is returned untouched — the header box
 * already reports why, and silently replacing what someone is mid-way through
 * typing would be worse than leaving it alone.
 */
export function applyAlgorithmToHeader(headerJson: string, algorithm: JwtAlgorithm): string {
    const parsed = parseJsonObject(headerJson);

    if (!parsed.ok) {
        return headerJson;
    }

    const next =
        "alg" in parsed.value
            ? { ...parsed.value, alg: algorithm }
            : { alg: algorithm, ...parsed.value };

    return JSON.stringify(next, null, JSON_INDENT);
}
