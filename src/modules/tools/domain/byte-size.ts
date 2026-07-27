import type { ByteSize } from "../types";

export const BYTES_PER_KILOBYTE = 1024;

/** UTF-8 byte length — a size measure, independent of any character set. */
export function getByteLength(text: string): number {
    return new TextEncoder().encode(text).length;
}

function roundToTenth(value: number): number {
    return Math.round(value * 10) / 10;
}

/** Locale-free size split into a number and a unit key the UI translates. */
export function describeByteSize(bytes: number): ByteSize {
    if (bytes < BYTES_PER_KILOBYTE) {
        return { value: bytes, unit: "b" };
    }

    if (bytes < BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE) {
        return { value: roundToTenth(bytes / BYTES_PER_KILOBYTE), unit: "kb" };
    }

    return {
        value: roundToTenth(bytes / (BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE)),
        unit: "mb",
    };
}
