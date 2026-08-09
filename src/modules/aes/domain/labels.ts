import type { PayloadBinaryEncoding, PayloadTextEncoding } from "@/modules/tools/types";
import type { AesMode } from "../types";

/**
 * Proper names, which are data rather than copy.
 *
 * `CBC`, `Base64` and `UTF-8` are spelled the same in every locale, so putting
 * them in the message catalogue would mean maintaining two identical copies and
 * inviting one of them to drift.
 */

export const MODE_LABELS: Record<AesMode, string> = {
    cbc: "CBC",
    gcm: "GCM",
    ctr: "CTR",
};

export const TEXT_ENCODING_LABELS: Record<PayloadTextEncoding, string> = {
    "utf-8": "UTF-8",
    hex: "Hex",
    base64: "Base64",
};

export const CIPHER_ENCODING_LABELS: Record<PayloadBinaryEncoding, string> = {
    hex: "Hex",
    base64: "Base64",
};
