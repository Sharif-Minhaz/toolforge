/**
 * What kind of secret the generator is composing. A literal union so
 * `password.modes.<mode>` stays statically checkable.
 */
export const PASSWORD_MODES = ["random", "memorable", "pin"] as const;

export type PasswordMode = (typeof PASSWORD_MODES)[number];

/** The four alphabets a random password can be drawn from. */
export const CHARACTER_CLASSES = ["uppercase", "lowercase", "numbers", "symbols"] as const;

export type CharacterClass = (typeof CHARACTER_CLASSES)[number];

/** What goes between the words of a passphrase. */
export const PASSWORD_SEPARATORS = ["hyphen", "dot", "underscore", "space", "none"] as const;

export type PasswordSeparator = (typeof PASSWORD_SEPARATORS)[number];

/**
 * Who is doing the guessing. A crack time is meaningless without one, so the
 * model is a control rather than a hidden constant — see `domain/crack-time.ts`
 * for the rate each one assumes and why it is rounded.
 */
export const ATTACK_MODELS = ["throttled", "bcrypt", "sha256", "md5"] as const;

export type AttackModel = (typeof ATTACK_MODELS)[number];

export const PASSWORD_STRENGTHS = ["very-weak", "weak", "fair", "strong", "very-strong"] as const;

export type PasswordStrength = (typeof PASSWORD_STRENGTHS)[number];

export type PasswordOptions = {
    readonly mode: PasswordMode;
    /**
     * Characters in `random`, words in `memorable`, digits in `pin`. One field
     * with three meanings, because it is one slider to the reader — the bounds
     * move with the mode, so `clampLength` runs whenever the mode does.
     */
    readonly length: number;
    readonly uppercase: boolean;
    readonly lowercase: boolean;
    readonly numbers: boolean;
    readonly symbols: boolean;
    /** Drops `iIlL1oO0|`, the glyphs that read as each other in most fonts. */
    readonly excludeSimilar: boolean;
    /** Drops brackets, quotes and slashes, which shells and CSVs mangle. */
    readonly excludeAmbiguous: boolean;
    readonly separator: PasswordSeparator;
    readonly capitalize: boolean;
    /** Appends a digit to one randomly chosen word of a passphrase. */
    readonly includeNumber: boolean;
    readonly attack: AttackModel;
};

/** How many characters of each class the generated value actually contains. */
export type PasswordComposition = Record<CharacterClass, number>;

export const CRACK_TIME_UNITS = ["seconds", "minutes", "hours", "days", "months", "years"] as const;

export type CrackTimeUnit = (typeof CRACK_TIME_UNITS)[number];

/**
 * Locale-free crack-time estimate. The UI formats `value` through
 * `Intl.NumberFormat`, so Bangla gets Bengali digits and Bengali magnitudes.
 */
export type CrackTime =
    /** Under a second: no useful number to show. */
    | { readonly kind: "instant" }
    | {
          readonly kind: "duration";
          readonly unit: CrackTimeUnit;
          readonly value: number;
          /** Past 1.38 × 10¹⁰ years, where the figure stops meaning anything. */
          readonly beyondUniverse: boolean;
      }
    /** So large that even a rounded year count is noise. */
    | { readonly kind: "beyond" };

export type PasswordFailureReason =
    | "invalid_length"
    /** Every character class switched off; there is nothing to draw from. */
    | "no_character_class";

export type PasswordGenerationFailure = {
    readonly ok: false;
    readonly reason: PasswordFailureReason;
};

export type PasswordGenerationSuccess = {
    readonly ok: true;
    readonly password: string;
    /**
     * Bits of entropy in the *process*, not in the string — an attacker who
     * knows these settings searches exactly this keyspace.
     */
    readonly entropyBits: number;
    /** Alphabet size in `random`/`pin`, wordlist size in `memorable`. */
    readonly poolSize: number;
    readonly strength: PasswordStrength;
    readonly composition: PasswordComposition;
};

/*
 * No `crackTime` here on purpose. It is a function of `entropyBits` and the
 * chosen attacker, so it belongs to whoever is displaying the result — see
 * `domain/crack-time.ts`. Baking it in would mean switching attacker had to
 * regenerate the password, handing the reader a different secret for asking a
 * different question about the one they had.
 */

export type PasswordGenerationResult = PasswordGenerationSuccess | PasswordGenerationFailure;

/**
 * Injected wherever randomness is used, so every branch — including the
 * rejection-sampling retry — can be pinned by a test. The browser default is
 * `crypto.getRandomValues`; nothing here ever falls back to `Math.random`.
 */
export type RandomBytes = (length: number) => Uint8Array;
