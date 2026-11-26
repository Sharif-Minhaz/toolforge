import type { ModeParseResult } from "../types";
import { MAX_MODE } from "./constants";

const OCTAL_DIGIT = /^[0-7]$/;

/**
 * `755`, `0755`, `4755` — and `7` or `44`, which GNU `chmod` reads as `007` and
 * `044`, so the tool does too. Leading zeros are allowed (`00755`); a fifth
 * significant digit is not.
 */
export function parseOctalMode(input: string): ModeParseResult {
    const characters = Array.from(input.trim());

    if (characters.length === 0) {
        return { ok: false, reason: "empty" };
    }

    const bad = characters.findIndex((character) => !OCTAL_DIGIT.test(character));

    if (bad !== -1) {
        return { ok: false, reason: "invalid_character", position: bad + 1 };
    }

    const mode = Number.parseInt(characters.join(""), 8);

    return mode > MAX_MODE ? { ok: false, reason: "out_of_range" } : { ok: true, mode };
}

/** `rwxr-xr-x`: three classes of three. */
const SYMBOLIC_LENGTH = 9;

/**
 * What `ls -l` may print in each slot besides `-`, and the bits it sets. A
 * special letter sets its special bit, and execute too when it is lowercase.
 */
const SLOT_BITS: readonly Readonly<Record<string, number>>[] = [
    { r: 0o400 },
    { w: 0o200 },
    { x: 0o100, s: 0o4100, S: 0o4000 },
    { r: 0o040 },
    { w: 0o020 },
    { x: 0o010, s: 0o2010, S: 0o2000 },
    { r: 0o004 },
    { w: 0o002 },
    { x: 0o001, t: 0o1001, T: 0o1000 },
];

/** `ls -l`'s first column: regular, directory, link, char/block device, pipe, socket. */
const FILE_TYPES = new Set(["-", "d", "l", "c", "b", "p", "s"]);

/** `ls -l`'s trailing marker: SELinux context, ACL, macOS extended attributes. */
const TRAILING_MARKERS = new Set([".", "+", "@"]);

/**
 * `rwxr-xr-x`, or a whole `ls -l` mode column — `drwxr-sr-x.`, `-rw-r--r--@` —
 * so a pasted column works without trimming it first. Case matters: `s` and `S`
 * are different modes.
 */
export function parseSymbolicMode(input: string): ModeParseResult {
    let characters = Array.from(input.trim());
    let offset = 0;

    if (characters.length === 0) {
        return { ok: false, reason: "empty" };
    }

    if (characters.length > SYMBOLIC_LENGTH && TRAILING_MARKERS.has(characters.at(-1) ?? "")) {
        characters = characters.slice(0, -1);
    }

    if (characters.length === SYMBOLIC_LENGTH + 1 && FILE_TYPES.has(characters[0] ?? "")) {
        characters = characters.slice(1);
        offset = 1;
    }

    if (characters.length !== SYMBOLIC_LENGTH) {
        return { ok: false, reason: "invalid_length" };
    }

    let mode = 0;

    for (const [index, character] of characters.entries()) {
        if (character === "-") {
            continue;
        }

        const slot = SLOT_BITS[index] ?? {};
        const bits = Object.hasOwn(slot, character) ? slot[character] : undefined;

        if (bits === undefined) {
            return {
                ok: false,
                reason: "invalid_character",
                position: index + 1 + offset,
                expected: [...Object.keys(slot), "-"],
            };
        }

        mode |= bits;
    }

    return { ok: true, mode };
}

/**
 * Either form, told apart by the first character: a digit means octal. Used
 * where one value arrives with no field to say which it is — `?mode=` and the
 * MCP argument.
 */
export function parseMode(input: string): ModeParseResult {
    return /^\d/.test(input.trim()) ? parseOctalMode(input) : parseSymbolicMode(input);
}
