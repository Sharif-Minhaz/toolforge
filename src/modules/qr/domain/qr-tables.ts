import type { QrErrorLevel } from "../types";

/**
 * The fixed tables and derived geometry of ISO/IEC 18004. Nothing here depends
 * on the payload, so it is all table lookup and arithmetic — kept apart from
 * `encoder.ts` so the encoder reads as the algorithm rather than as data.
 *
 * Every table is indexed by version, `1` through `40`, with a `0` at the front
 * so the index and the version number are the same value.
 */

export const QR_MIN_VERSION = 1;

export const QR_MAX_VERSION = 40;

/** Error-correction codewords in each block, per version and level. */
const ECC_CODEWORDS_PER_BLOCK: Record<QrErrorLevel, readonly number[]> = {
    L: [
        0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28,
        30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    M: [
        0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28,
        28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    ],
    Q: [
        0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30,
        30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    H: [
        0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24,
        30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
};

/** How many blocks the data is split across, per version and level. */
const ECC_BLOCK_COUNT: Record<QrErrorLevel, readonly number[]> = {
    L: [
        0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13,
        14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
    ],
    M: [
        0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23,
        25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
    ],
    Q: [
        0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29,
        34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
    ],
    H: [
        0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35,
        37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
    ],
};

/** The two format-information bits each level is written as. Not its ordinal. */
export const ERROR_LEVEL_FORMAT_BITS: Record<QrErrorLevel, number> = {
    L: 1,
    M: 0,
    Q: 3,
    H: 2,
};

export const QR_MODES = ["numeric", "alphanumeric", "byte"] as const;

export type QrMode = (typeof QR_MODES)[number];

export const MODE_INDICATOR: Record<QrMode, number> = {
    numeric: 0b0001,
    alphanumeric: 0b0010,
    byte: 0b0100,
};

/**
 * Character-count field width, which widens twice as versions grow. Indexed by
 * the version bands 1–9, 10–26 and 27–40.
 */
const CHAR_COUNT_BITS: Record<QrMode, readonly [number, number, number]> = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
};

/** The 45 characters alphanumeric mode can pack two-to-eleven-bits. */
export const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function getCharCountBits(mode: QrMode, version: number): number {
    const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;

    return CHAR_COUNT_BITS[mode][band];
}

/** Modules per side. Version 1 is 21×21 and each version adds four. */
export function getModuleCount(version: number): number {
    return version * 4 + 17;
}

/**
 * Modules left for data and error correction once the finder, alignment and
 * timing patterns, the format information and the version information have
 * taken their share.
 */
export function getRawDataModules(version: number): number {
    let modules = (16 * version + 128) * version + 64;

    if (version >= 2) {
        const alignmentCount = Math.floor(version / 7) + 2;

        modules -= (25 * alignmentCount - 10) * alignmentCount - 55;

        if (version >= 7) {
            modules -= 36;
        }
    }

    return modules;
}

export function getEccCodewordsPerBlock(version: number, level: QrErrorLevel): number {
    return ECC_CODEWORDS_PER_BLOCK[level][version];
}

export function getBlockCount(version: number, level: QrErrorLevel): number {
    return ECC_BLOCK_COUNT[level][version];
}

/** Total codewords in the symbol, data and error correction together. */
export function getTotalCodewords(version: number): number {
    return Math.floor(getRawDataModules(version) / 8);
}

/** How many of those codewords the payload itself gets. */
export function getDataCodewords(version: number, level: QrErrorLevel): number {
    return (
        getTotalCodewords(version) -
        getEccCodewordsPerBlock(version, level) * getBlockCount(version, level)
    );
}

/**
 * Row and column centres of the alignment patterns. The first is always at 6
 * and the last at `size - 7`; the ones between are spaced as evenly as an even
 * step allows, which is why the gap nearest the top-left is sometimes wider.
 */
export function getAlignmentPositions(version: number): number[] {
    if (version === 1) {
        return [];
    }

    const count = Math.floor(version / 7) + 2;
    // Version 32 is the one case the general formula gets wrong.
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const positions = [6];

    for (let position = version * 4 + 10; positions.length < count; position -= step) {
        positions.splice(1, 0, position);
    }

    return positions;
}
