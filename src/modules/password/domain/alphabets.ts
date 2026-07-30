import {
    CHARACTER_CLASSES,
    type CharacterClass,
    type PasswordComposition,
    type PasswordMode,
    type PasswordOptions,
} from "../types";

/**
 * The alphabets a random password is drawn from, and the two exclusion sets
 * that trim them.
 *
 * All four together are the 94 printable ASCII characters — everything from `!`
 * to `~`. Nothing outside that range is offered: a password containing a
 * non-ASCII character is rejected by enough login forms, terminals and legacy
 * systems that offering it would be a trap rather than a feature.
 */
export const ALPHABETS: Record<CharacterClass, string> = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{}|;:,.<>?/~`'\"\\",
};

/**
 * Glyphs that read as each other in most fonts. The pipe is in here alongside
 * the classic seven because it is indistinguishable from `l` and `I` in several
 * common terminal faces.
 */
export const SIMILAR_CHARACTERS = "iIlL1oO0|";

/**
 * Characters that survive generation and then get mangled downstream — by a
 * shell, a CSV column, a JSON string or a URL. Excluding them costs entropy,
 * which is why it is off by default.
 */
export const AMBIGUOUS_CHARACTERS = "{}[]()/\\'\"`~,;:.<>";

/** One selected class, after the exclusions have been applied to it. */
export type AlphabetClass = {
    readonly name: CharacterClass;
    readonly characters: string;
};

export type Alphabet = {
    /** Selected classes that still have characters left in them. */
    readonly classes: readonly AlphabetClass[];
    /** Every remaining character, in class order. */
    readonly pool: string;
};

/**
 * Character-class toggles and both exclusions only mean anything when the value
 * is drawn character by character. A passphrase is drawn from a wordlist and a
 * PIN from the ten digits, so the whole panel goes quiet in those modes rather
 * than sitting there doing nothing.
 *
 * Shared by the domain and the UI so the two can never disagree.
 */
export function supportsCharacterPool(mode: PasswordMode): boolean {
    return mode === "random";
}

function excluded(options: PasswordOptions): string {
    return (
        (options.excludeSimilar ? SIMILAR_CHARACTERS : "") +
        (options.excludeAmbiguous ? AMBIGUOUS_CHARACTERS : "")
    );
}

function selected(options: PasswordOptions): readonly CharacterClass[] {
    return CHARACTER_CLASSES.filter((name) => options[name]);
}

/**
 * The alphabet a random password is composed from.
 *
 * A class that the exclusions emptied is dropped rather than kept as an empty
 * bucket, so nothing downstream can try to guarantee a character from it. No
 * combination of the sets above actually empties one — a test holds that — but
 * the sets are data, and data changes.
 */
export function buildAlphabet(options: PasswordOptions): Alphabet {
    const drop = new Set(excluded(options));

    const classes = selected(options)
        .map((name) => ({
            name,
            characters: [...ALPHABETS[name]].filter((character) => !drop.has(character)).join(""),
        }))
        .filter((entry) => entry.characters.length > 0);

    return {
        classes,
        pool: classes.map((entry) => entry.characters).join(""),
    };
}

/**
 * How many characters of each class a finished value contains, measured against
 * the full alphabets — a `Q` is uppercase whether or not the reader had
 * uppercase switched on when it was drawn.
 */
export function countComposition(password: string): PasswordComposition {
    const counts: Record<CharacterClass, number> = {
        uppercase: 0,
        lowercase: 0,
        numbers: 0,
        symbols: 0,
    };

    for (const character of password) {
        for (const name of CHARACTER_CLASSES) {
            if (ALPHABETS[name].includes(character)) {
                counts[name] += 1;
                break;
            }
        }
    }

    return counts;
}
