import { pickCharacter } from "@/modules/tools/domain/random";
import type { RandomBytes } from "@/modules/tools/types";

import {
    RECOVERY_ALPHABET,
    RECOVERY_GROUP_SEPARATOR,
    RECOVERY_GROUP_SIZE,
    RECOVERY_KEY_LENGTH,
} from "./constants";

/**
 * The printable credential that moves a workspace to another browser.
 *
 * Crockford's base32 rather than hex or the full alphabet, for one reason: this
 * value gets written on paper and typed back in somewhere else. Crockford drops
 * the four glyphs that survive that trip badly and, on the way back in, folds
 * the mistakes a reader makes anyway — `O` for zero, `I` and `L` for one. A
 * visitor who transcribes `8QXK` as `8OXK` is let in rather than told their key
 * is wrong, and nothing is weakened by it: those characters were never drawn,
 * so the keyspace is unchanged at 32^16.
 *
 * Two spellings exist and only one of them is ever hashed. The **canonical**
 * form is sixteen upper-case alphabet characters with no separators; that is
 * what `hashRecoveryKey` sees, so `8qxk h72d…` and `8QXK-H72D-…` are one key.
 * The **display** form carries the hyphens and is what a human is shown.
 */

/**
 * Sixteen characters of a 32-symbol alphabet — 80 bits.
 *
 * Enough that guessing is hopeless even though the import endpoint is
 * unauthenticated by definition, and short enough to copy off a screen. The
 * rate limit on import is what turns "hopeless" into "not worth attempting";
 * the entropy is what makes the limit sufficient rather than load-bearing.
 */
export function createRecoveryKey(randomBytes: RandomBytes): string {
    let value = "";

    for (let index = 0; index < RECOVERY_KEY_LENGTH; index += 1) {
        value += pickCharacter(RECOVERY_ALPHABET, randomBytes);
    }

    return value;
}

/** Groups a canonical key for reading: `8QXK-H72D-9FLC-4M2P`. */
export function formatRecoveryKey(canonical: string): string {
    const groups: string[] = [];

    for (let index = 0; index < canonical.length; index += RECOVERY_GROUP_SIZE) {
        groups.push(canonical.slice(index, index + RECOVERY_GROUP_SIZE));
    }

    return groups.join(RECOVERY_GROUP_SEPARATOR);
}

/**
 * Crockford's decoding rules: case is insignificant, and the three glyphs the
 * alphabet omits fold onto the digits they are misread as.
 */
function foldCharacter(character: string): string {
    switch (character) {
        case "O":
            return "0";
        case "I":
        case "L":
            return "1";
        default:
            return character;
    }
}

const RECOVERY_PATTERN = new RegExp(`^[${RECOVERY_ALPHABET}]{${RECOVERY_KEY_LENGTH}}$`);

/**
 * What somebody typed, reduced to the one spelling that gets hashed — or
 * `null` when it could not be a key at all.
 *
 * Total by design. Hyphens, spaces, lower case and a stray tab all survive,
 * because every one of them is what a person actually pastes; only the length
 * and the alphabet are enforced. Rejecting here is what keeps a scripted walk
 * of the keyspace away from the database entirely.
 */
export function normalizeRecoveryKey(input: string): string | null {
    const stripped = input
        .toUpperCase()
        .split("")
        .filter((character) => /[0-9A-Z]/.test(character))
        .map(foldCharacter)
        .join("");

    return RECOVERY_PATTERN.test(stripped) ? stripped : null;
}
