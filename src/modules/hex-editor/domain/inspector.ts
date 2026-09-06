import { byteToAscii, byteToHex } from "./format";
import {
    INSPECTOR_KEYS,
    type Endianness,
    type InspectorKey,
    type InspectorReading,
} from "../types";

/**
 * Every way of reading the bytes under the caret.
 *
 * The labels are here rather than in the message catalogue on purpose: `UInt24`,
 * `Float16` and `GUID` are proper names, and a translated `Float16` would be a
 * translated `Float16`. Only the panel's heading is copy.
 *
 * Two readings are written by hand rather than handed to `DataView`. `UInt24` has
 * no accessor at all — three bytes is not a machine word — and `Float16`'s
 * accessor is recent enough that Bun, Node and the browsers this has to run in
 * do not agree on having it. Both are a dozen lines of arithmetic, and a dozen
 * lines that behave the same everywhere beats a capability probe.
 */

export const INSPECTOR_LABELS: Record<InspectorKey, string> = {
    binary: "Binary",
    octal: "Octal",
    uint8: "UInt8",
    int8: "Int8",
    uint16: "UInt16",
    int16: "Int16",
    uint24: "UInt24",
    int24: "Int24",
    uint32: "UInt32",
    int32: "Int32",
    uint64: "UInt64",
    int64: "Int64",
    float16: "Float16",
    float32: "Float32",
    float64: "Float64",
    ascii: "ASCII",
    utf8: "UTF-8",
    utf16: "UTF-16",
    guid: "GUID",
};

/** How many bytes each reading consumes. `utf8` is the one that varies. */
const WIDTHS: Record<InspectorKey, number> = {
    binary: 1,
    octal: 1,
    uint8: 1,
    int8: 1,
    uint16: 2,
    int16: 2,
    uint24: 3,
    int24: 3,
    uint32: 4,
    int32: 4,
    uint64: 8,
    int64: 8,
    float16: 2,
    float32: 4,
    float64: 8,
    ascii: 1,
    utf8: 1,
    utf16: 2,
    guid: 16,
};

/**
 * `true` means "least significant byte first", which is what `DataView` calls
 * its `littleEndian` argument.
 */
function isLittle(endian: Endianness): boolean {
    return endian === "little";
}

/**
 * Reads every row from one window of bytes taken at the caret.
 *
 * `bytes` is however many the document had left — a caret four bytes from the
 * end gets four. Rows that need more than that come back with a `null` value and
 * stay in the list, so the panel keeps its height and a reader can see that
 * `Int64` did not fit rather than watching it vanish.
 */
export function readInspector(bytes: Uint8Array, endian: Endianness): readonly InspectorReading[] {
    // Copied so the `DataView` is over a buffer that starts where the caret does
    // and is definitely not shared.
    const window = Uint8Array.from(bytes);
    const view = new DataView(window.buffer);
    const little = isLittle(endian);
    const available = window.length;

    const utf8 = decodeUtf8(window);

    function value(key: InspectorKey): string | null {
        if (available < WIDTHS[key] && key !== "utf8") {
            return null;
        }

        switch (key) {
            case "binary":
                return window[0].toString(2).padStart(8, "0");
            case "octal":
                return window[0].toString(8).padStart(3, "0");
            case "uint8":
                return String(view.getUint8(0));
            case "int8":
                return String(view.getInt8(0));
            case "uint16":
                return String(view.getUint16(0, little));
            case "int16":
                return String(view.getInt16(0, little));
            case "uint24":
                return String(readUint24(window, little));
            case "int24":
                return String(signExtend24(readUint24(window, little)));
            case "uint32":
                return String(view.getUint32(0, little));
            case "int32":
                return String(view.getInt32(0, little));
            case "uint64":
                return view.getBigUint64(0, little).toString();
            case "int64":
                return view.getBigInt64(0, little).toString();
            case "float16":
                return formatFloat(decodeFloat16(view.getUint16(0, little)));
            case "float32":
                return formatFloat(view.getFloat32(0, little));
            case "float64":
                return formatFloat(view.getFloat64(0, little));
            case "ascii":
                return byteToAscii(window[0]);
            case "utf8":
                return utf8?.text ?? null;
            case "utf16":
                return decodeUtf16(window, little);
            case "guid":
                return formatGuid(window, little);
        }
    }

    return INSPECTOR_KEYS.map((key) => ({
        key,
        label: INSPECTOR_LABELS[key],
        value: available === 0 ? null : value(key),
        width: key === "utf8" ? (utf8?.width ?? WIDTHS.utf8) : WIDTHS[key],
    }));
}

function readUint24(bytes: Uint8Array, little: boolean): number {
    return little
        ? bytes[0] | (bytes[1] << 8) | (bytes[2] << 16)
        : (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
}

/** Bit 23 is the sign; shifting it up to bit 31 and back does the extension. */
function signExtend24(value: number): number {
    return (value << 8) >> 8;
}

/**
 * IEEE 754 binary16, by hand.
 *
 * Exponent `0` is subnormal — no implicit leading one — and exponent `31` is
 * where the infinities and the NaNs live. Everything between is the ordinary
 * case, biased by 15.
 */
export function decodeFloat16(bits: number): number {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const mantissa = bits & 0x03ff;

    if (exponent === 0) {
        return sign * mantissa * 2 ** -24;
    }

    if (exponent === 0x1f) {
        return mantissa === 0 ? sign * Infinity : Number.NaN;
    }

    return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/**
 * Written the way a reader expects to see a float, not the way JavaScript
 * prints one: `Infinity` and `NaN` pass through as themselves, and an ordinary
 * value keeps enough digits to be recognised without becoming a wall.
 */
function formatFloat(value: number): string {
    if (Number.isNaN(value)) {
        return "NaN";
    }

    if (!Number.isFinite(value)) {
        return value > 0 ? "Infinity" : "-Infinity";
    }

    if (Number.isInteger(value) && Math.abs(value) < 1e15) {
        return String(value);
    }

    return String(Number(value.toPrecision(9)));
}

/**
 * The first code point at the caret, and how many bytes it took.
 *
 * Written out rather than handed to `TextDecoder` because the question is "what
 * does this sequence say", not "what can be salvaged from it": a decoder answers
 * a truncated or malformed sequence with U+FFFD, which reads as a real character
 * sitting in the file. `null` is the honest answer, and the row says so.
 */
function decodeUtf8(bytes: Uint8Array): { text: string; width: number } | null {
    const first = bytes[0];

    if (first === undefined) {
        return null;
    }

    if (first < 0x80) {
        return { text: byteToAscii(first), width: 1 };
    }

    const width = first >= 0xf0 ? 4 : first >= 0xe0 ? 3 : first >= 0xc0 ? 2 : 0;

    if (width === 0 || bytes.length < width) {
        return null;
    }

    let codePoint = first & (0xff >> (width + 1));

    for (let index = 1; index < width; index += 1) {
        const continuation = bytes[index];

        if ((continuation & 0xc0) !== 0x80) {
            return null;
        }

        codePoint = (codePoint << 6) | (continuation & 0x3f);
    }

    // An overlong encoding, a surrogate half, or something past the last plane:
    // all three are sequences no encoder should have written.
    const minimum = width === 2 ? 0x80 : width === 3 ? 0x800 : 0x10000;

    if (
        codePoint < minimum ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
        return null;
    }

    return { text: String.fromCodePoint(codePoint), width };
}

/**
 * One UTF-16 code unit, or the pair when the caret is on a high surrogate and
 * its partner is there — a lone half is `null` rather than a replacement glyph.
 */
function decodeUtf16(bytes: Uint8Array, little: boolean): string | null {
    const unit = little ? bytes[0] | (bytes[1] << 8) : (bytes[0] << 8) | bytes[1];

    if (unit >= 0xdc00 && unit <= 0xdfff) {
        return null;
    }

    if (unit < 0xd800 || unit > 0xdbff) {
        return String.fromCharCode(unit);
    }

    if (bytes.length < 4) {
        return null;
    }

    const low = little ? bytes[2] | (bytes[3] << 8) : (bytes[2] << 8) | bytes[3];

    if (low < 0xdc00 || low > 0xdfff) {
        return null;
    }

    return String.fromCharCode(unit, low);
}

/**
 * Sixteen bytes as a GUID, in whichever of its two layouts the endianness
 * selector is asking for.
 *
 * Big-endian is RFC 4122's: the bytes in the order they appear. Little-endian is
 * Microsoft's mixed layout, where the first three fields are byte-swapped and
 * the last two are not — which is why the same sixteen bytes name two different
 * GUIDs depending on who wrote them, and why the selector is not decoration.
 */
function formatGuid(bytes: Uint8Array, little: boolean): string {
    const hex = (indices: readonly number[]) =>
        indices.map((index) => byteToHex(bytes[index])).join("");

    const group = (start: number, size: number, swap: boolean): string => {
        const indices = Array.from({ length: size }, (_, offset) => start + offset);

        return hex(swap ? indices.toReversed() : indices);
    };

    return [
        group(0, 4, little),
        group(4, 2, little),
        group(6, 2, little),
        group(8, 2, false),
        group(10, 6, false),
    ].join("-");
}
