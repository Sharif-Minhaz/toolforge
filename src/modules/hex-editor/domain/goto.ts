import type { GoToResult } from "../types";

/**
 * Reading what somebody typed into Go To.
 *
 * Three forms, and the ambiguity in them is deliberate. `0x200` is hexadecimal
 * because it says so. `512` and `200` are decimal because a plain number in a
 * box is a decimal number, even in a hex editor — guessing otherwise would make
 * `20` mean 32 to the tool and 20 to the reader, and there is nothing on screen
 * to tell them which happened.
 *
 * `200h`, the other notation a debugger might have taught somebody, is accepted
 * too: it also says what it is.
 */
export function parseOffsetInput(raw: string, length: number): GoToResult {
    const input = raw.trim().replace(/^\+/u, "");

    if (input.length === 0) {
        return { ok: false, reason: "empty" };
    }

    const hexPrefixed = /^0x([0-9a-f]+)$/iu.exec(input);
    const hexSuffixed = /^([0-9a-f]+)h$/iu.exec(input);
    const decimal = /^[0-9]+$/u.test(input);

    const offset = hexPrefixed
        ? Number.parseInt(hexPrefixed[1], 16)
        : hexSuffixed
          ? Number.parseInt(hexSuffixed[1], 16)
          : decimal
            ? Number.parseInt(input, 10)
            : Number.NaN;

    if (!Number.isSafeInteger(offset)) {
        return { ok: false, reason: "not_a_number" };
    }

    if (length <= 0 || offset >= length) {
        return { ok: false, reason: "out_of_range" };
    }

    return { ok: true, offset };
}
