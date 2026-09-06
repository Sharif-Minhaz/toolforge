import { BYTES_PER_ROW, OFFSET_DIGITS } from "./constants";

/**
 * How bytes are written down.
 *
 * Uppercase throughout, which is the convention every hex editor worth copying
 * from uses: `FF` and `ff` read the same to a machine, but `FF` next to a
 * lowercase ASCII column is the difference between two glances and one.
 *
 * Nothing here caches. A row is formatted while it is on screen and thrown away
 * when it scrolls off, because the alternative — a string per byte of a 512 MiB
 * file — is eight gigabytes of strings to avoid a `toString(16)`.
 */

const HEX_DIGITS = "0123456789ABCDEF";

/** Two uppercase digits. Faster than `toString(16).padStart` and it shows. */
export function byteToHex(value: number): string {
    return HEX_DIGITS[(value >> 4) & 0xf] + HEX_DIGITS[value & 0xf];
}

/** One uppercase digit, for the half-typed byte the caret is sitting on. */
export function nibbleToHex(value: number): string {
    return HEX_DIGITS[value & 0xf];
}

/**
 * `0` – `9`, `A` – `F`, either case, to its value. `null` for anything else.
 *
 * The length check is not decoration: `indexOf("")` is `0` on every string, so
 * without it an empty keystroke reads as the digit zero and types a byte.
 */
export function hexDigitValue(character: string): number | null {
    if (character.length !== 1) {
        return null;
    }

    const index = HEX_DIGITS.indexOf(character.toUpperCase());

    return index === -1 ? null : index;
}

export function isPrintableAscii(value: number): boolean {
    return value >= 32 && value <= 126;
}

/** The ASCII column: printable characters as themselves, everything else a dot. */
export function byteToAscii(value: number): string {
    return isPrintableAscii(value) ? String.fromCharCode(value) : ".";
}

/** Eight uppercase digits — `0000002F`. */
export function formatOffset(offset: number): string {
    return offset.toString(16).toUpperCase().padStart(OFFSET_DIGITS, "0");
}

/** The row an offset falls on, and where it sits inside it. */
export function rowForOffset(offset: number): number {
    return Math.floor(offset / BYTES_PER_ROW);
}

export function columnForOffset(offset: number): number {
    return offset % BYTES_PER_ROW;
}

export function rowStartOffset(row: number): number {
    return row * BYTES_PER_ROW;
}

/**
 * How many rows a document of this length occupies.
 *
 * One row for an empty document rather than none, so the grid renders its
 * headers and an empty line instead of collapsing to nothing before a file is
 * opened.
 */
export function rowCount(length: number): number {
    return Math.max(1, Math.ceil(length / BYTES_PER_ROW));
}

/**
 * A classic hex dump — offset, sixteen bytes, ASCII — for the clipboard and for
 * the MCP adapters, which have no grid to look at.
 *
 * A short final row keeps its column alignment: the missing bytes are spaces,
 * so a dump pasted into a terminal still lines up.
 */
export function formatHexDump(bytes: Uint8Array, startOffset = 0): string {
    const lines: string[] = [];

    for (let index = 0; index < bytes.length; index += BYTES_PER_ROW) {
        const row = bytes.subarray(index, index + BYTES_PER_ROW);
        const hex: string[] = [];
        let ascii = "";

        for (let column = 0; column < BYTES_PER_ROW; column += 1) {
            const value = row[column];

            if (value === undefined) {
                hex.push("  ");
                continue;
            }

            hex.push(byteToHex(value));
            ascii += byteToAscii(value);
        }

        // The gap after the eighth byte is the convention `hexdump -C` set, and
        // it is what makes a 16-wide row scannable without counting.
        const left = hex.slice(0, 8).join(" ");
        const right = hex.slice(8).join(" ");

        lines.push(`${formatOffset(startOffset + index)}  ${left}  ${right}  ${ascii}`);
    }

    return lines.join("\n");
}
