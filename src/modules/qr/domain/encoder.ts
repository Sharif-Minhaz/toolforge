import type { QrEncodeResult, QrErrorLevel, QrMatrix } from "../types";
import {
    ALPHANUMERIC_CHARSET,
    ERROR_LEVEL_FORMAT_BITS,
    getAlignmentPositions,
    getBlockCount,
    getCharCountBits,
    getDataCodewords,
    getEccCodewordsPerBlock,
    getModuleCount,
    getTotalCodewords,
    MODE_INDICATOR,
    QR_MAX_VERSION,
    QR_MIN_VERSION,
    type QrMode,
} from "./qr-tables";
import { computeDivisor, computeRemainder } from "./reed-solomon";

/**
 * Text to a finished QR matrix, per ISO/IEC 18004. Pure and deterministic: the
 * same string and level always produce the same modules, which is what lets the
 * page server-render the first code and hand it to the island as props.
 */

/* --------------------------------------------------------------- segment --- */

const NUMERIC_PATTERN = /^\d+$/;

/**
 * The densest mode that can carry the whole string. One mode for the payload
 * rather than a stream of mixed segments: splitting `HTTPS://EXAMPLE.COM/A1` in
 * two saves a handful of bits and costs a second mode header, and real payloads
 * here are either all digits, all uppercase, or neither.
 */
export function selectMode(text: string): QrMode {
    if (NUMERIC_PATTERN.test(text)) {
        return "numeric";
    }

    for (const character of text) {
        if (!ALPHANUMERIC_CHARSET.includes(character)) {
            return "byte";
        }
    }

    return "alphanumeric";
}

/** Bits the payload occupies once the mode header and count field are added. */
function countDataBits(mode: QrMode, text: string, bytes: Uint8Array, version: number): number {
    const header = 4 + getCharCountBits(mode, version);

    if (mode === "numeric") {
        const groups = Math.floor(text.length / 3);
        const remainder = text.length % 3;

        return header + groups * 10 + (remainder === 0 ? 0 : remainder * 3 + 1);
    }

    if (mode === "alphanumeric") {
        return header + Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
    }

    return header + bytes.length * 8;
}

/* ------------------------------------------------------------ bit buffer --- */

class BitBuffer {
    private readonly bits: number[] = [];

    get length(): number {
        return this.bits.length;
    }

    append(value: number, width: number): void {
        for (let bit = width - 1; bit >= 0; bit -= 1) {
            this.bits.push((value >>> bit) & 1);
        }
    }

    /** Pads to a whole number of bytes and packs, most significant bit first. */
    toBytes(): Uint8Array {
        const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));

        for (const [index, bit] of this.bits.entries()) {
            bytes[index >>> 3] |= bit << (7 - (index & 7));
        }

        return bytes;
    }
}

function writeSegment(buffer: BitBuffer, mode: QrMode, text: string, bytes: Uint8Array): void {
    if (mode === "numeric") {
        for (let index = 0; index < text.length; index += 3) {
            const group = text.slice(index, index + 3);

            buffer.append(Number(group), group.length * 3 + 1);
        }

        return;
    }

    if (mode === "alphanumeric") {
        for (let index = 0; index < text.length; index += 2) {
            const first = ALPHANUMERIC_CHARSET.indexOf(text[index]);

            if (index + 1 === text.length) {
                buffer.append(first, 6);

                return;
            }

            buffer.append(first * 45 + ALPHANUMERIC_CHARSET.indexOf(text[index + 1]), 11);
        }

        return;
    }

    for (const byte of bytes) {
        buffer.append(byte, 8);
    }
}

/** The two alternating filler codewords the specification names. */
const PAD_CODEWORDS = [0xec, 0x11] as const;

function buildDataCodewords(
    mode: QrMode,
    text: string,
    bytes: Uint8Array,
    version: number,
    level: QrErrorLevel,
): Uint8Array {
    const capacityBits = getDataCodewords(version, level) * 8;
    const buffer = new BitBuffer();

    buffer.append(MODE_INDICATOR[mode], 4);
    buffer.append(mode === "byte" ? bytes.length : text.length, getCharCountBits(mode, version));
    writeSegment(buffer, mode, text, bytes);

    // Terminator, then whatever it takes to land on a byte boundary.
    buffer.append(0, Math.min(4, capacityBits - buffer.length));
    buffer.append(0, (8 - (buffer.length % 8)) % 8);

    const codewords = new Uint8Array(capacityBits / 8);
    codewords.set(buffer.toBytes());

    for (let index = buffer.length / 8; index < codewords.length; index += 1) {
        codewords[index] = PAD_CODEWORDS[(index - buffer.length / 8) % 2];
    }

    return codewords;
}

/**
 * Splits the data into blocks, appends each block's error correction, then
 * interleaves them. Interleaving is what makes a QR code survive a smudge: a
 * contiguous run of damaged modules is spread thinly across every block instead
 * of destroying one of them outright.
 */
function interleave(data: Uint8Array, version: number, level: QrErrorLevel): Uint8Array {
    const blockCount = getBlockCount(version, level);
    const eccPerBlock = getEccCodewordsPerBlock(version, level);
    const totalCodewords = getTotalCodewords(version);
    const shortBlockCount = blockCount - (totalCodewords % blockCount);
    const shortBlockLength = Math.floor(totalCodewords / blockCount);
    const divisor = computeDivisor(eccPerBlock);

    const blocks: { data: Uint8Array; ecc: Uint8Array }[] = [];
    let offset = 0;

    for (let index = 0; index < blockCount; index += 1) {
        const length = shortBlockLength - eccPerBlock + (index < shortBlockCount ? 0 : 1);
        const block = data.subarray(offset, offset + length);

        offset += length;
        blocks.push({ data: block, ecc: computeRemainder(block, divisor) });
    }

    const result = new Uint8Array(totalCodewords);
    let cursor = 0;

    // The short blocks have no codeword at the final data index, so that column
    // is skipped rather than padded.
    for (let index = 0; index < shortBlockLength - eccPerBlock + 1; index += 1) {
        for (const [blockIndex, block] of blocks.entries()) {
            if (index < block.data.length || blockIndex >= shortBlockCount) {
                result[cursor] = block.data[index];
                cursor += 1;
            }
        }
    }

    for (let index = 0; index < eccPerBlock; index += 1) {
        for (const block of blocks) {
            result[cursor] = block.ecc[index];
            cursor += 1;
        }
    }

    return result;
}

/* ---------------------------------------------------------------- canvas --- */

/**
 * The symbol while it is being drawn: the modules themselves, plus which of
 * them belong to a function pattern and must therefore never be masked or
 * overwritten by data.
 */
class SymbolCanvas {
    readonly size: number;
    readonly modules: Uint8Array;
    private readonly reserved: Uint8Array;

    constructor(readonly version: number) {
        this.size = getModuleCount(version);
        this.modules = new Uint8Array(this.size * this.size);
        this.reserved = new Uint8Array(this.size * this.size);
    }

    get(x: number, y: number): number {
        return this.modules[y * this.size + x];
    }

    isReserved(x: number, y: number): boolean {
        return this.reserved[y * this.size + x] === 1;
    }

    private inside(x: number, y: number): boolean {
        return x >= 0 && x < this.size && y >= 0 && y < this.size;
    }

    setFunction(x: number, y: number, dark: boolean): void {
        if (!this.inside(x, y)) {
            return;
        }

        this.modules[y * this.size + x] = dark ? 1 : 0;
        this.reserved[y * this.size + x] = 1;
    }

    setData(x: number, y: number, dark: boolean): void {
        this.modules[y * this.size + x] = dark ? 1 : 0;
    }

    toggle(x: number, y: number): void {
        this.modules[y * this.size + x] ^= 1;
    }
}

function drawFinderPattern(canvas: SymbolCanvas, centreX: number, centreY: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
            const distance = Math.max(Math.abs(dx), Math.abs(dy));

            // The ring at distance 2 and the separator at distance 4 are light;
            // everything else in the 9×9 is dark.
            canvas.setFunction(centreX + dx, centreY + dy, distance !== 2 && distance !== 4);
        }
    }
}

function drawAlignmentPattern(canvas: SymbolCanvas, centreX: number, centreY: number): void {
    for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
            canvas.setFunction(
                centreX + dx,
                centreY + dy,
                Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
            );
        }
    }
}

/**
 * Fifteen bits of level and mask, protected by a BCH(15, 5) code and XORed with
 * a fixed pattern so an all-light symbol is not a valid format field.
 */
function computeFormatBits(level: QrErrorLevel, mask: number): number {
    const data = (ERROR_LEVEL_FORMAT_BITS[level] << 3) | mask;
    let remainder = data;

    for (let step = 0; step < 10; step += 1) {
        remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }

    return ((data << 10) | remainder) ^ 0x5412;
}

function drawFormatBits(canvas: SymbolCanvas, level: QrErrorLevel, mask: number): void {
    const bits = computeFormatBits(level, mask);
    const bit = (index: number) => ((bits >>> index) & 1) === 1;
    const { size } = canvas;

    for (let index = 0; index <= 5; index += 1) {
        canvas.setFunction(8, index, bit(index));
    }

    canvas.setFunction(8, 7, bit(6));
    canvas.setFunction(8, 8, bit(7));
    canvas.setFunction(7, 8, bit(8));

    for (let index = 9; index < 15; index += 1) {
        canvas.setFunction(14 - index, 8, bit(index));
    }

    for (let index = 0; index < 8; index += 1) {
        canvas.setFunction(size - 1 - index, 8, bit(index));
    }

    for (let index = 8; index < 15; index += 1) {
        canvas.setFunction(8, size - 15 + index, bit(index));
    }

    // Always dark, and always in the same place. Scanners use it to confirm the
    // symbol is the right way up.
    canvas.setFunction(8, size - 8, true);
}

/** Eighteen bits of version, protected by a BCH(18, 6) code. Version 7 and up. */
function drawVersionBits(canvas: SymbolCanvas): void {
    if (canvas.version < 7) {
        return;
    }

    let remainder = canvas.version;

    for (let step = 0; step < 12; step += 1) {
        remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }

    const bits = (canvas.version << 12) | remainder;

    for (let index = 0; index < 18; index += 1) {
        const dark = ((bits >>> index) & 1) === 1;
        const far = canvas.size - 11 + (index % 3);
        const near = Math.floor(index / 3);

        canvas.setFunction(far, near, dark);
        canvas.setFunction(near, far, dark);
    }
}

function drawFunctionPatterns(canvas: SymbolCanvas, level: QrErrorLevel): void {
    const { size } = canvas;

    for (let index = 0; index < size; index += 1) {
        const dark = index % 2 === 0;

        canvas.setFunction(6, index, dark);
        canvas.setFunction(index, 6, dark);
    }

    drawFinderPattern(canvas, 3, 3);
    drawFinderPattern(canvas, size - 4, 3);
    drawFinderPattern(canvas, 3, size - 4);

    const positions = getAlignmentPositions(canvas.version);
    const last = positions.length - 1;

    for (const [row, y] of positions.entries()) {
        for (const [column, x] of positions.entries()) {
            // The three corners already hold finder patterns.
            const onFinder =
                (row === 0 && column === 0) ||
                (row === 0 && column === last) ||
                (row === last && column === 0);

            if (!onFinder) {
                drawAlignmentPattern(canvas, x, y);
            }
        }
    }

    // Drawn with a placeholder mask purely to reserve the modules; the real
    // format bits go down once the mask has been chosen.
    drawFormatBits(canvas, level, 0);
    drawVersionBits(canvas);
}

/**
 * Lays the interleaved codewords out in the two-module-wide column pairs that
 * snake up and down the symbol, skipping every reserved module and the vertical
 * timing pattern in column 6.
 */
function drawCodewords(canvas: SymbolCanvas, codewords: Uint8Array): void {
    const { size } = canvas;
    let index = 0;
    let right = size - 1;

    while (right >= 1) {
        // Column 6 is the vertical timing pattern. The pair that would have
        // covered it shifts one column left and every later pair follows, so
        // this steps the cursor rather than skipping a column outright.
        if (right === 6) {
            right = 5;
        }

        for (let step = 0; step < size; step += 1) {
            for (let offset = 0; offset < 2; offset += 1) {
                const x = right - offset;
                const upward = ((right + 1) & 2) === 0;
                const y = upward ? size - 1 - step : step;

                if (!canvas.isReserved(x, y) && index < codewords.length * 8) {
                    const bit = (codewords[index >>> 3] >>> (7 - (index & 7))) & 1;

                    canvas.setData(x, y, bit === 1);
                    index += 1;
                }
            }
        }

        right -= 2;
    }
}

/* ------------------------------------------------------------------ mask --- */

const MASK_RULES: readonly ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(canvas: SymbolCanvas, mask: number): void {
    const rule = MASK_RULES[mask];

    for (let y = 0; y < canvas.size; y += 1) {
        for (let x = 0; x < canvas.size; x += 1) {
            if (!canvas.isReserved(x, y) && rule(x, y)) {
                canvas.toggle(x, y);
            }
        }
    }
}

const PENALTY_RUN = 3;
const PENALTY_BLOCK = 3;
const PENALTY_FINDER_LIKE = 40;
const PENALTY_IMBALANCE = 10;

/** Records one run length, padding the first run with the light quiet zone. */
function pushRun(history: number[], length: number, size: number): void {
    const padded = history[0] === 0 ? length + size : length;

    history.pop();
    history.unshift(padded);
}

/**
 * How many times the 1:1:3:1:1 finder proportion appears in the recorded runs.
 * Two, when the run is bounded by enough light on both sides.
 */
function countFinderLike(history: readonly number[]): number {
    const unit = history[1];
    const core =
        unit > 0 &&
        history[2] === unit &&
        history[3] === unit * 3 &&
        history[4] === unit &&
        history[5] === unit;

    if (!core) {
        return 0;
    }

    return (
        (history[0] >= unit * 4 && history[6] >= unit ? 1 : 0) +
        (history[6] >= unit * 4 && history[0] >= unit ? 1 : 0)
    );
}

function terminateRun(history: number[], darkRun: boolean, length: number, size: number): number {
    let final = length;

    if (darkRun) {
        pushRun(history, final, size);
        final = 0;
    }

    pushRun(history, final + size, size);

    return countFinderLike(history);
}

/**
 * The four penalties the specification defines. The mask with the lowest total
 * is the one written into the symbol — a low score means fewer long same-colour
 * runs and fewer shapes a scanner could mistake for a finder pattern.
 */
function scoreMask(canvas: SymbolCanvas): number {
    const { size } = canvas;
    let score = 0;

    for (let major = 0; major < size; major += 1) {
        for (const horizontal of [true, false]) {
            const history = [0, 0, 0, 0, 0, 0, 0];
            let runDark = false;
            let runLength = 0;

            for (let minor = 0; minor < size; minor += 1) {
                const dark =
                    (horizontal ? canvas.get(minor, major) : canvas.get(major, minor)) === 1;

                if (dark === runDark) {
                    runLength += 1;

                    if (runLength === 5) {
                        score += PENALTY_RUN;
                    } else if (runLength > 5) {
                        score += 1;
                    }

                    continue;
                }

                pushRun(history, runLength, size);

                if (!runDark) {
                    score += countFinderLike(history) * PENALTY_FINDER_LIKE;
                }

                runDark = dark;
                runLength = 1;
            }

            score += terminateRun(history, runDark, runLength, size) * PENALTY_FINDER_LIKE;
        }
    }

    for (let y = 0; y < size - 1; y += 1) {
        for (let x = 0; x < size - 1; x += 1) {
            const corner = canvas.get(x, y);

            if (
                corner === canvas.get(x + 1, y) &&
                corner === canvas.get(x, y + 1) &&
                corner === canvas.get(x + 1, y + 1)
            ) {
                score += PENALTY_BLOCK;
            }
        }
    }

    const total = size * size;
    let dark = 0;

    for (const value of canvas.modules) {
        dark += value;
    }

    // Every five percentage points away from an even light/dark split costs
    // another ten.
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * PENALTY_IMBALANCE;

    return score;
}

/* ---------------------------------------------------------------- encode --- */

/** The smallest version the payload fits into at the requested level. */
function selectVersion(
    mode: QrMode,
    text: string,
    bytes: Uint8Array,
    level: QrErrorLevel,
): number | null {
    for (let version = QR_MIN_VERSION; version <= QR_MAX_VERSION; version += 1) {
        if (countDataBits(mode, text, bytes, version) <= getDataCodewords(version, level) * 8) {
            return version;
        }
    }

    return null;
}

export function encodeQr(text: string, level: QrErrorLevel): QrEncodeResult {
    if (text.length === 0) {
        return { ok: false, reason: "empty" };
    }

    const mode = selectMode(text);
    // Byte mode carries UTF-8 without an ECI header, which is what every
    // scanner in circulation assumes when the bytes are not plain ASCII.
    const bytes = new TextEncoder().encode(text);
    const version = selectVersion(mode, text, bytes, level);

    if (version === null) {
        return { ok: false, reason: "too_long" };
    }

    const canvas = new SymbolCanvas(version);

    drawFunctionPatterns(canvas, level);
    drawCodewords(
        canvas,
        interleave(buildDataCodewords(mode, text, bytes, version, level), version, level),
    );

    let bestMask = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let mask = 0; mask < MASK_RULES.length; mask += 1) {
        applyMask(canvas, mask);
        drawFormatBits(canvas, level, mask);

        const score = scoreMask(canvas);

        if (score < bestScore) {
            bestScore = score;
            bestMask = mask;
        }

        // The mask is its own inverse, so undoing it costs one more pass.
        applyMask(canvas, mask);
    }

    applyMask(canvas, bestMask);
    drawFormatBits(canvas, level, bestMask);

    const matrix: QrMatrix = {
        size: canvas.size,
        version,
        level,
        mask: bestMask,
        modules: canvas.modules,
    };

    return { ok: true, matrix };
}

/** Whether the module at these coordinates is dark. Out of bounds counts light. */
export function isDark(matrix: QrMatrix, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) {
        return false;
    }

    return matrix.modules[y * matrix.size + x] === 1;
}
