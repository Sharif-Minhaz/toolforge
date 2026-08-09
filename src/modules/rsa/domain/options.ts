import { SLOW_KEY_SIZE_FLOOR, WEAK_KEY_SIZE_CEILING } from "./constants";
import { RSA_KEY_FORMATS, type RsaKeyFormat } from "@/modules/tools/types";
import {
    RSA_HASHES,
    RSA_KEY_SIZES,
    RSA_OUTPUT_FORMATS,
    RSA_USAGES,
    type RsaHash,
    type RsaKeySize,
    type RsaOutputFormat,
    type RsaUsage,
} from "../types";

/**
 * The one cross-option rule in the tool, asked once and answered in one place.
 *
 * A JWK is not a DER container — it carries the RSA numbers as base64url fields
 * — so under it the PKCS#8 / PKCS#1 choice has nothing at all to act on. The
 * picker is disabled and says why, rather than sitting there taking a value that
 * changes no character of the output.
 */
export function keyFormatApplies(outputFormat: RsaOutputFormat): boolean {
    return outputFormat !== "jwk";
}

/** Below every current guideline, and warned about above the button. */
export function isWeakKeySize(keySize: RsaKeySize): boolean {
    return keySize <= WEAK_KEY_SIZE_CEILING;
}

/** Long enough that the wait needs announcing before the press, not after. */
export function isSlowKeySize(keySize: RsaKeySize): boolean {
    return keySize >= SLOW_KEY_SIZE_FLOOR;
}

export function isRsaKeySize(value: number): value is RsaKeySize {
    return RSA_KEY_SIZES.includes(value as RsaKeySize);
}

export function isRsaUsage(value: string): value is RsaUsage {
    return RSA_USAGES.includes(value as RsaUsage);
}

export function isRsaHash(value: string): value is RsaHash {
    return RSA_HASHES.includes(value as RsaHash);
}

export function isRsaKeyFormat(value: string): value is RsaKeyFormat {
    return RSA_KEY_FORMATS.includes(value as RsaKeyFormat);
}

export function isRsaOutputFormat(value: string): value is RsaOutputFormat {
    return RSA_OUTPUT_FORMATS.includes(value as RsaOutputFormat);
}
