import { deserialize, EJSON, serialize } from "bson";

import { base64ToBytes, bytesToBase64 } from "@/modules/tools/domain/base64";
import { bytesToHex, hexToBytes } from "@/modules/tools/domain/hex";
import type { BsonEncoding, ConversionFailure, EjsonMode, JsonObject, JsonValue } from "../types";

/**
 * Every promotion turned off.
 *
 * The defaults hand back the nearest JavaScript type — a `Double` becomes a
 * number, a `Long` inside 53 bits becomes a number — and the BSON type is gone
 * before Extended JSON is ever asked to write it down. `Double(1)` then comes
 * out as `{"$numberInt":"1"}` and a document that was byte-identical on paper
 * is not. Keeping the wrappers is what makes canonical mode's guarantee true.
 */
const FAITHFUL_DESERIALIZE = {
    promoteValues: false,
    promoteLongs: false,
    promoteBuffers: false,
    bsonRegExp: true,
} as const;

/**
 * `relaxed: false` on the way back in, for the mirror-image reason: the default
 * promotes `{"$numberLong":"9007199254740993"}` to a JavaScript number, which
 * cannot hold it, and writes a double where an int64 belongs.
 */
const FAITHFUL_EJSON_PARSE = { relaxed: false } as const;

export type ReadBsonResult =
    | {
          readonly ok: true;
          readonly value: JsonValue;
          /**
           * Relaxed mode only: whether writing this document back out of what
           * relaxed Extended JSON preserved returns the same bytes. Measured
           * per document instead of warned about in general, because most
           * documents survive relaxed intact and a warning that is usually
           * wrong is a warning people stop reading.
           */
          readonly lossy: boolean;
      }
    | ConversionFailure;

export type WriteBsonResult = { readonly ok: true; readonly bytes: Uint8Array } | ConversionFailure;

export function bytesToBsonText(bytes: Uint8Array, encoding: BsonEncoding): string {
    return encoding === "hex" ? bytesToHex(bytes) : bytesToBase64(bytes);
}

/**
 * A BSON document opens with its own total length as a little-endian int32, so
 * a truncated paste can be named precisely instead of reported as "invalid".
 * Truncation is by far the commonest way one of these arrives broken.
 */
function declaredLength(bytes: Uint8Array): number | undefined {
    if (bytes.length < 4) {
        return undefined;
    }

    return new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0, true);
}

export function readBsonText(text: string, encoding: BsonEncoding): Uint8Array | null {
    // Hex arrives wrapped from a terminal as readily as base64 does, and the
    // strict reader underneath tolerates neither.
    const compact = text.replace(/\s+/g, "");

    return encoding === "hex" ? hexToBytes(compact) : base64ToBytes(compact);
}

/** BSON bytes → the Extended JSON shape of the same document. */
export function readBson(bytes: Uint8Array, mode: EjsonMode): ReadBsonResult {
    let document: ReturnType<typeof deserialize>;

    try {
        document = deserialize(bytes, FAITHFUL_DESERIALIZE);
    } catch {
        return {
            ok: false,
            reason: "invalid_bson",
            declaredBytes: declaredLength(bytes),
            actualBytes: bytes.length,
        };
    }

    const value = EJSON.serialize(document, { relaxed: mode === "relaxed" }) as JsonObject;

    if (mode === "canonical") {
        return { ok: true, value, lossy: false };
    }

    return { ok: true, value, lossy: !survivesRelaxed(bytes, value) };
}

/**
 * The round trip, run at the model rather than at the text: read what relaxed
 * mode wrote, write BSON from it, and compare bytes with what came in. That is
 * the only honest way to answer "did this cost me anything" for *this*
 * document — the general answer is "sometimes", which helps nobody.
 */
function survivesRelaxed(original: Uint8Array, relaxed: JsonObject): boolean {
    const rewritten = writeBson(relaxed);

    if (!rewritten.ok || rewritten.bytes.length !== original.length) {
        return false;
    }

    return rewritten.bytes.every((byte, index) => byte === original[index]);
}

/** The Extended JSON shape of a document → the bytes MongoDB would store. */
export function writeBson(value: JsonValue): WriteBsonResult {
    // BSON's top level is a document. An array or a bare number has no encoding
    // at the root, and the driver refuses rather than inventing one — so this
    // is caught here where it can be named, not at the throw.
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, reason: "root_not_object" };
    }

    try {
        const document = EJSON.deserialize(value, FAITHFUL_EJSON_PARSE) as Record<string, unknown>;

        return { ok: true, bytes: serialize(document) };
    } catch {
        return { ok: false, reason: "invalid_bson" };
    }
}
