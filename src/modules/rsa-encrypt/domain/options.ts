import { RSA_KEY_KINDS, type RsaKeyKind } from "@/modules/tools/types";
import {
    RSA_CRYPT_HASHES,
    RSA_KEY_INPUT_FORMATS,
    RSA_PADDINGS,
    type RsaCryptDirection,
    type RsaCryptHash,
    type RsaKeyInputFormat,
    type RsaPadding,
} from "../types";

/**
 * The one cross-option rule in the tool, asked once and answered in one place.
 *
 * A public key cannot decrypt. Not "should not" — the private exponent is the
 * only number that undoes the public one and it is not present in a public key
 * at all. So under Decrypt the Key Type toggle has one legal answer, and it is
 * disabled and says why rather than offering a choice that cannot work.
 */
export function keyKindApplies(direction: RsaCryptDirection): boolean {
    return direction === "encrypt";
}

/** What the toggle has to read as, whether or not it can be changed. */
export function requiredKeyKind(direction: RsaCryptDirection, chosen: RsaKeyKind): RsaKeyKind {
    return keyKindApplies(direction) ? chosen : "private";
}

export function isKeyInputFormat(value: string): value is RsaKeyInputFormat {
    return (RSA_KEY_INPUT_FORMATS as readonly string[]).includes(value);
}

export function isRsaKeyKind(value: string): value is RsaKeyKind {
    return (RSA_KEY_KINDS as readonly string[]).includes(value);
}

export function isRsaPadding(value: string): value is RsaPadding {
    return (RSA_PADDINGS as readonly string[]).includes(value);
}

export function isRsaCryptHash(value: string): value is RsaCryptHash {
    return (RSA_CRYPT_HASHES as readonly string[]).includes(value);
}
