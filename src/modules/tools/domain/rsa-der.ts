import {
    PEM_LABELS,
    type CipherBytes,
    type PemLabel,
    type RsaKeyFormat,
    type RsaKeyKind,
} from "../types";

/**
 * Just enough DER to move an RSA key between the two containers it is written
 * in, in both directions.
 *
 * Web Crypto reads and writes `spki` and `pkcs8` and nothing else — there is no
 * `pkcs1` in the specification, and there is no sign of one arriving. A PKCS#1
 * block is not a re-encoding of either, though: both containers carry the bare
 * `RSAPublicKey` or `RSAPrivateKey` verbatim inside them, one inside a BIT
 * STRING and one inside an OCTET STRING. So the work here is unwrapping and
 * wrapping, never re-encoding the RSA numbers themselves, and the bytes that
 * come out are the same bytes OpenSSL would have written.
 *
 * That claim is not taken on trust: `tools/tests/rsa-der.test.ts` hands every
 * block this file produces to `node:crypto`, which is a completely separate
 * ASN.1 implementation, and checks it round-trips byte for byte.
 *
 * Only the shapes those two containers actually take are handled. Anything else
 * returns `null` rather than throwing — a reader gets a named refusal, never a
 * stack trace.
 *
 * Shared by the key generator, which unwraps to offer PKCS#1 output, and by the
 * encryption tool, which wraps so a pasted PKCS#1 block can be imported at all.
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
export function unwrapSpki(spki: CipherBytes): CipherBytes | null {
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
export function unwrapPkcs8(pkcs8: CipherBytes): CipherBytes | null {
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

/**
 * Which of the four headers an RSA key gets, from the two things that decide it.
 *
 * The pairing is not symmetric in its naming and that trips people up: PKCS#8's
 * private half says `PRIVATE KEY` while its public half says `PUBLIC KEY` and is
 * strictly a SubjectPublicKeyInfo, which is a different specification again.
 * PKCS#1's two halves are the ones that read as a matching pair.
 */
export function pemLabelFor(format: RsaKeyFormat, kind: RsaKeyKind): PemLabel {
    if (format === "pkcs8") {
        return kind === "public" ? PEM_LABELS.spki : PEM_LABELS.pkcs8;
    }

    return kind === "public" ? PEM_LABELS.pkcs1Public : PEM_LABELS.pkcs1Private;
}

/**
 * `AlgorithmIdentifier` for `rsaEncryption`, complete: the OID
 * 1.2.840.113549.1.1.1 followed by the explicit NULL parameters RFC 3279
 * requires.
 *
 * A fixed constant rather than an encoder, because there is exactly one of these
 * and every RSA key in every container this tool touches carries it verbatim.
 * Writing a general OID encoder to produce fifteen known bytes would be more
 * code and more ways to be wrong.
 */
const RSA_ENCRYPTION_ALGORITHM = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]);

/** `INTEGER 0` — the version field of a `PrivateKeyInfo`. */
const PKCS8_VERSION = new Uint8Array([0x02, 0x01, 0x00]);

/**
 * A DER length: short form below 128, otherwise a leading byte counting the
 * big-endian length bytes that follow.
 *
 * DER, unlike BER, requires the *shortest* encoding — 127 has to be `7f` and
 * never `81 7f`. A reader that accepted both would still refuse to round-trip,
 * because the bytes would differ from what every other writer produces.
 */
function encodeLength(length: number): number[] {
    if (length < 0x80) {
        return [length];
    }

    const bytes: number[] = [];
    let remaining = length;

    while (remaining > 0) {
        bytes.unshift(remaining % 256);
        remaining = Math.floor(remaining / 256);
    }

    return [0x80 | bytes.length, ...bytes];
}

/** One tag-length-value, with its parts already in hand. */
function writeTlv(tag: number, ...content: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
    const length = content.reduce((total, part) => total + part.length, 0);
    const header = [tag, ...encodeLength(length)];
    const out = new Uint8Array(header.length + length);

    out.set(header, 0);

    let offset = header.length;

    for (const part of content) {
        out.set(part, offset);
        offset += part.length;
    }

    return out;
}

/**
 * `RSAPublicKey` → `SubjectPublicKeyInfo`, which is the only public container
 * Web Crypto will import.
 *
 * The BIT STRING's leading `0x00` counts the unused bits in its final octet. For
 * a DER structure it is always zero, and it is content rather than framing —
 * omitting it produces a block that parses and then decodes to nonsense.
 */
export function wrapPkcs1AsSpki(pkcs1PublicKey: Uint8Array): Uint8Array<ArrayBuffer> {
    return writeTlv(
        SEQUENCE,
        RSA_ENCRYPTION_ALGORITHM,
        writeTlv(BIT_STRING, new Uint8Array([0x00]), pkcs1PublicKey),
    );
}

/** `RSAPrivateKey` → `PrivateKeyInfo`, likewise the only private one it takes. */
export function wrapPkcs1AsPkcs8(pkcs1PrivateKey: Uint8Array): Uint8Array<ArrayBuffer> {
    return writeTlv(
        SEQUENCE,
        PKCS8_VERSION,
        RSA_ENCRYPTION_ALGORITHM,
        writeTlv(OCTET_STRING, pkcs1PrivateKey),
    );
}
