/**
 * Character sets the converter can move text through.
 *
 * Decoding leans on the browser's own `TextDecoder`, which implements the whole
 * WHATWG Encoding Standard. Encoding has no such counterpart — `TextEncoder`
 * only speaks UTF-8 — so every other set is encoded from a table this module
 * derives by inverting its decoder, which is only possible for the single-byte
 * ones. Multi-byte legacy sets are therefore decode-only, and say so.
 */

export const CHARSET_IDS = [
    "utf-8",
    "ascii",
    "iso-8859-1",
    "iso-8859-2",
    "iso-8859-6",
    "iso-8859-15",
    "windows-1250",
    "windows-1251",
    "windows-1252",
    "koi8-r",
    "ibm866",
    "utf-16le",
    "utf-16be",
    "shift_jis",
    "gbk",
    "gb18030",
    "big5",
    "euc-jp",
    "euc-kr",
] as const;

export type CharsetId = (typeof CHARSET_IDS)[number];

/**
 * How text becomes bytes for a given set:
 * - `utf-8` and `utf-16` use a native encoder
 * - `ascii` accepts the 7-bit range only
 * - `latin1` maps U+0000–U+00FF straight onto bytes, which is ISO-8859-1 by
 *   definition (`TextDecoder` folds that label into windows-1252)
 * - `single-byte` inverts the decoder's own 256-entry table
 * - `null` marks a set this converter can only read
 */
export type CharsetEncoder =
    "utf-8" | "utf-16le" | "utf-16be" | "ascii" | "latin1" | "single-byte" | null;

export type Charset = {
    readonly id: CharsetId;
    /** Shown as-is in the UI — these are proper names, not translated copy. */
    readonly label: string;
    /** Label handed to `TextDecoder`. */
    readonly decoder: string;
    readonly encoder: CharsetEncoder;
};

export const CHARSETS: readonly Charset[] = [
    { id: "utf-8", label: "UTF-8", decoder: "utf-8", encoder: "utf-8" },
    { id: "ascii", label: "ASCII", decoder: "windows-1252", encoder: "ascii" },
    { id: "iso-8859-1", label: "ISO-8859-1", decoder: "windows-1252", encoder: "latin1" },
    { id: "iso-8859-2", label: "ISO-8859-2", decoder: "iso-8859-2", encoder: "single-byte" },
    { id: "iso-8859-6", label: "ISO-8859-6", decoder: "iso-8859-6", encoder: "single-byte" },
    { id: "iso-8859-15", label: "ISO-8859-15", decoder: "iso-8859-15", encoder: "single-byte" },
    { id: "windows-1250", label: "Windows-1250", decoder: "windows-1250", encoder: "single-byte" },
    { id: "windows-1251", label: "Windows-1251", decoder: "windows-1251", encoder: "single-byte" },
    { id: "windows-1252", label: "Windows-1252", decoder: "windows-1252", encoder: "single-byte" },
    { id: "koi8-r", label: "KOI8-R", decoder: "koi8-r", encoder: "single-byte" },
    { id: "ibm866", label: "IBM866 (CP866)", decoder: "ibm866", encoder: "single-byte" },
    { id: "utf-16le", label: "UTF-16LE", decoder: "utf-16le", encoder: "utf-16le" },
    { id: "utf-16be", label: "UTF-16BE", decoder: "utf-16be", encoder: "utf-16be" },
    { id: "shift_jis", label: "Shift_JIS (CP932)", decoder: "shift_jis", encoder: null },
    { id: "gbk", label: "GBK (CP936)", decoder: "gbk", encoder: null },
    { id: "gb18030", label: "GB18030", decoder: "gb18030", encoder: null },
    { id: "big5", label: "Big5 (CP950)", decoder: "big5", encoder: null },
    { id: "euc-jp", label: "EUC-JP", decoder: "euc-jp", encoder: null },
    { id: "euc-kr", label: "EUC-KR", decoder: "euc-kr", encoder: null },
];

const BY_ID = new Map<CharsetId, Charset>(CHARSETS.map((charset) => [charset.id, charset]));

export function getCharset(id: CharsetId): Charset {
    // Every id in the union has an entry, so this only guards a bad cast.
    return BY_ID.get(id) ?? CHARSETS[0];
}

export function getCharsetLabel(id: CharsetId): string {
    return getCharset(id).label;
}

/** The sets text can be written into, for the encode direction. */
export const ENCODABLE_CHARSETS: readonly Charset[] = CHARSETS.filter(
    (charset) => charset.encoder !== null,
);

export function isEncodable(id: CharsetId): boolean {
    return getCharset(id).encoder !== null;
}
