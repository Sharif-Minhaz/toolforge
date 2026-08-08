/**
 * Just enough DER to take the PKCS#1 structure back out of the two containers
 * Web Crypto will export.
 *
 * Web Crypto writes `spki` and `pkcs8` and nothing else — there is no
 * `exportKey("pkcs1", …)` in the specification, and there is no sign of one
 * arriving. A PKCS#1 block is not a re-encoding of either, though: both
 * containers carry the bare `RSAPublicKey` or `RSAPrivateKey` verbatim inside
 * them, one inside a BIT STRING and one inside an OCTET STRING. So the work here
 * is unwrapping, not re-encoding, and the bytes that come out are the same bytes
 * OpenSSL would have written.
 *
 * That claim is not taken on trust: `tests/der.test.ts` hands every block this
 * file produces to `node:crypto`, which is a completely separate ASN.1 reader,
 * and checks that re-exporting from there reproduces the original SPKI and
 * PKCS#8 byte for byte.
 *
 * Only the shapes those two containers actually take are handled. Anything else
 * returns `null` rather than throwing — a reader gets a named refusal, never a
 * stack trace.
 */

/** One tag-length-value header, already resolved past the long-form length. */
type Tlv = {
    readonly tag: number;
    readonly contentStart: number;
    readonly end: number;
};

const SEQUENCE = 0x30;
const INTEGER = 0x02;
const BIT_STRING = 0x03;
const OCTET_STRING = 0x04;

/** The high bit of the first length byte marks the long form. */
const LONG_FORM = 0x80;

/**
 * Reads the header at `offset`.
 *
 * The length may be short form — one byte, up to 127 — or long form, where the
 * low seven bits say how many bytes of big-endian length follow. Four length
 * bytes is the ceiling here: an RSA key is a few kilobytes, and a declared
 * length past `Number.MAX_SAFE_INTEGER` is not something to try to represent.
 */
function readTlv(bytes: Uint8Array, offset: number): Tlv | null {
    if (offset + 2 > bytes.length) {
        return null;
    }

    const tag = bytes[offset];
    let cursor = offset + 1;
    let length = bytes[cursor];
    cursor += 1;

    if ((length & LONG_FORM) !== 0) {
        const lengthBytes = length & 0x7f;

        // Zero is the indefinite form, which DER forbids; past four is a length
        // no key this tool writes could need.
        if (lengthBytes === 0 || lengthBytes > 4 || cursor + lengthBytes > bytes.length) {
            return null;
        }

        length = 0;

        for (let index = 0; index < lengthBytes; index += 1) {
            length = length * 256 + bytes[cursor];
            cursor += 1;
        }
    }

    const end = cursor + length;

    return end > bytes.length ? null : { tag, contentStart: cursor, end };
}

/** The same read, refusing anything that is not the tag the caller expected. */
function readTagged(bytes: Uint8Array, offset: number, tag: number): Tlv | null {
    const tlv = readTlv(bytes, offset);

    return tlv === null || tlv.tag !== tag ? null : tlv;
}

/**
 * `SubjectPublicKeyInfo ::= SEQUENCE { algorithm AlgorithmIdentifier,
 *                                      subjectPublicKey BIT STRING }`
 *
 * The BIT STRING's first content byte counts the unused bits in its final
 * octet. For a public key that is always zero, and a non-zero value means this
 * is not the structure it claims to be rather than something to skip past.
 */
export function unwrapSpki(spki: Uint8Array): Uint8Array | null {
    const sequence = readTagged(spki, 0, SEQUENCE);

    if (sequence === null) {
        return null;
    }

    const algorithm = readTagged(spki, sequence.contentStart, SEQUENCE);

    if (algorithm === null) {
        return null;
    }

    const bitString = readTagged(spki, algorithm.end, BIT_STRING);

    if (bitString === null || spki[bitString.contentStart] !== 0x00) {
        return null;
    }

    return spki.slice(bitString.contentStart + 1, bitString.end);
}

/**
 * `PrivateKeyInfo ::= SEQUENCE { version INTEGER, privateKeyAlgorithm
 *                                AlgorithmIdentifier, privateKey OCTET STRING }`
 *
 * The version is read rather than skipped, because a `PrivateKeyInfo` and an
 * `EncryptedPrivateKeyInfo` differ in their first field and confusing the two
 * would hand back a passphrase-wrapped blob labelled as a key.
 */
export function unwrapPkcs8(pkcs8: Uint8Array): Uint8Array | null {
    const sequence = readTagged(pkcs8, 0, SEQUENCE);

    if (sequence === null) {
        return null;
    }

    const version = readTagged(pkcs8, sequence.contentStart, INTEGER);

    if (version === null) {
        return null;
    }

    const algorithm = readTagged(pkcs8, version.end, SEQUENCE);

    if (algorithm === null) {
        return null;
    }

    const octetString = readTagged(pkcs8, algorithm.end, OCTET_STRING);

    return octetString === null ? null : pkcs8.slice(octetString.contentStart, octetString.end);
}

/**
 * Modulus width in bits, read from the `RSAPublicKey` the two unwrappers
 * produce: `SEQUENCE { modulus INTEGER, publicExponent INTEGER }`.
 *
 * A DER INTEGER is signed, so a modulus whose top bit is set carries a leading
 * zero byte that is padding rather than magnitude. Counting it would report
 * 2056 bits for a 2048-bit key roughly half the time, which is why the leading
 * zeroes come off before the width is measured.
 */
export function readModulusBits(pkcs1PublicKey: Uint8Array): number | null {
    const modulus = readRsaField(pkcs1PublicKey, 0);

    if (modulus === null) {
        return null;
    }

    const leadingByte = pkcs1PublicKey[modulus.start];
    const bitsInLeadingByte = 32 - Math.clz32(leadingByte);

    return (modulus.end - modulus.start - 1) * 8 + bitsInLeadingByte;
}

/**
 * The public exponent from the same structure, read back rather than echoed
 * from what was asked for — an engine may normalise `00 01 00 01` to `01 00 01`,
 * and the number the key actually carries is the one worth reporting.
 *
 * `null` past six bytes, which is the point at which a base-256 accumulation
 * stops being exactly representable. No public exponent in use is anywhere near
 * it, and reporting a rounded one would be worse than reporting none.
 */
export function readPublicExponent(pkcs1PublicKey: Uint8Array): number | null {
    const exponent = readRsaField(pkcs1PublicKey, 1);

    if (exponent === null || exponent.end - exponent.start > 6) {
        return null;
    }

    let value = 0;

    for (let index = exponent.start; index < exponent.end; index += 1) {
        value = value * 256 + pkcs1PublicKey[index];
    }

    return value;
}

/**
 * The nth INTEGER inside `RSAPublicKey ::= SEQUENCE { modulus INTEGER,
 * publicExponent INTEGER }`, with its leading zeroes already off.
 *
 * A DER INTEGER is signed, so a value whose top bit is set carries a leading
 * zero byte that is padding rather than magnitude. Counting it would report 2056
 * bits for a 2048-bit key roughly half the time.
 */
function readRsaField(
    pkcs1PublicKey: Uint8Array,
    index: number,
): { readonly start: number; readonly end: number } | null {
    const sequence = readTagged(pkcs1PublicKey, 0, SEQUENCE);

    if (sequence === null) {
        return null;
    }

    let cursor = sequence.contentStart;
    let field = readTagged(pkcs1PublicKey, cursor, INTEGER);

    for (let seen = 0; seen < index; seen += 1) {
        if (field === null) {
            return null;
        }

        cursor = field.end;
        field = readTagged(pkcs1PublicKey, cursor, INTEGER);
    }

    if (field === null) {
        return null;
    }

    let start = field.contentStart;

    while (start < field.end - 1 && pkcs1PublicKey[start] === 0x00) {
        start += 1;
    }

    return pkcs1PublicKey[start] === 0x00 && field.end - start === 1
        ? null
        : { start, end: field.end };
}
