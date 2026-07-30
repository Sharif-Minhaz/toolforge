import type { RandomBytes } from "../types";

/**
 * Uniform random selection on top of the Web Crypto API. The same code path runs
 * on the server and in the browser, and nothing here ever reaches for
 * `Math.random` — a password drawn from a predictable generator is not a
 * password.
 */

/** One 32-bit draw per selection. Plenty for any pool this tool offers. */
const DRAW_BYTES = 4;

const DRAW_SPACE = 2 ** 32;

/**
 * How many rejected draws in a row count as a broken random source rather than
 * bad luck. For the largest pool here the rejection probability is under
 * 3 × 10⁻⁷, so reaching this is not luck: it is an injected source that does not
 * vary. Programmer error, hence a throw.
 */
const MAX_DRAWS = 64;

export const cryptoRandomBytes: RandomBytes = (length) => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    return bytes;
};

export class RandomSourceError extends Error {
    readonly code = "random_source_stuck";

    constructor() {
        super(`Random source returned ${MAX_DRAWS} rejected draws in a row.`);
        this.name = "RandomSourceError";
    }
}

/**
 * A uniform integer in `[0, exclusiveMax)`, by rejection sampling.
 *
 * The obvious `draw % exclusiveMax` is biased whenever the pool size does not
 * divide 2³² — the low residues get one extra chance each, which for a 94
 * character pool tilts the first 42 characters of the alphabet. Tiny, but it is
 * a bias in a password generator, so the draws that would cause it are thrown
 * away and redrawn instead. Pool sizes that are a power of two (the 1024-word
 * list, for one) divide evenly and never reject.
 *
 * @throws {RandomSourceError} when the injected source cannot produce an
 * acceptable draw, which only a broken source can manage.
 */
export function randomIndex(exclusiveMax: number, randomBytes: RandomBytes): number {
    if (exclusiveMax <= 1) {
        return 0;
    }

    const limit = DRAW_SPACE - (DRAW_SPACE % exclusiveMax);

    for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
        const bytes = randomBytes(DRAW_BYTES);
        const draw = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;

        if (draw < limit) {
            return draw % exclusiveMax;
        }
    }

    throw new RandomSourceError();
}

export function pick<T>(items: readonly T[], randomBytes: RandomBytes): T {
    return items[randomIndex(items.length, randomBytes)];
}

/** A random character of `characters`, which is never treated as a code-point array. */
export function pickCharacter(characters: string, randomBytes: RandomBytes): string {
    return characters[randomIndex(characters.length, randomBytes)];
}

/**
 * Fisher–Yates, so the characters a mode guarantees do not always land in the
 * same positions. Without it every password would open with an uppercase letter
 * and an attacker would get the first character for free.
 */
export function shuffle<T>(items: readonly T[], randomBytes: RandomBytes): T[] {
    const out = [...items];

    for (let index = out.length - 1; index > 0; index -= 1) {
        const swap = randomIndex(index + 1, randomBytes);
        [out[index], out[swap]] = [out[swap], out[index]];
    }

    return out;
}
