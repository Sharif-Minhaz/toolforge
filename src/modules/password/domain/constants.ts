import type { AttackModel, PasswordMode, PasswordOptions, PasswordStrength } from "../types";

/* -------------------------------------------------------------- length --- */

/**
 * One slider, three meanings, three ranges. Switching mode can strand the
 * current value outside the new range, so `clampLength` runs with the mode.
 */
export const PASSWORD_LENGTH_RANGE: Record<PasswordMode, { min: number; max: number }> = {
    // Four characters is the shortest thing that can still hold one of each
    // class; 128 is where the entropy figure stops being the limiting factor.
    random: { min: 4, max: 128 },
    memorable: { min: 3, max: 12 },
    pin: { min: 3, max: 12 },
};

export const DEFAULT_PASSWORD_LENGTH: Record<PasswordMode, number> = {
    random: 20,
    // Six words is the shortest passphrase that still clears the `fair` band
    // against the default attacker. Four is memorable and too weak to default to.
    memorable: 6,
    pin: 6,
};

/* ------------------------------------------------------------- strength --- */

/**
 * Lower bound of each band, in bits. Anchored to the default attacker — an
 * offline SHA-256 rig at 10¹¹ guesses a second — so the labels mean something
 * concrete rather than being a feel:
 *
 * - 40 bits falls in seconds.
 * - 60 bits falls in about two months.
 * - 80 bits is out of reach of one rig today.
 * - 112 bits is out of reach of any attacker worth modelling.
 */
export const STRENGTH_THRESHOLD_BITS: Record<PasswordStrength, number> = {
    "very-weak": 0,
    weak: 40,
    fair: 60,
    strong: 80,
    "very-strong": 112,
};

/* --------------------------------------------------------------- attack --- */

/**
 * Guesses per second per scenario, deliberately rounded to a power of ten.
 *
 * These are the order of magnitude of published hashcat-class benchmarks for a
 * multi-GPU rig, not measurements taken here. Rounding is the honest choice: a
 * figure like 164,100,000,000 implies a precision this estimate does not have,
 * and GPU generations move it every year. The article says where to look up
 * current numbers.
 */
export const ATTACK_GUESSES_PER_SECOND: Record<AttackModel, number> = {
    /** A login form that rate-limits. Nothing is leaked; guessing is remote. */
    throttled: 1e2,
    /** Leaked bcrypt hashes at cost 12 — deliberately slow to compute. */
    bcrypt: 1e4,
    /** Leaked SHA-256 hashes. Fast to compute, so fast to attack. */
    sha256: 1e11,
    /** Leaked MD5 or NTLM hashes: the worst realistic case. */
    md5: 1e12,
};

export const DEFAULT_ATTACK_MODEL: AttackModel = "sha256";

/* -------------------------------------------------------------- defaults --- */

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
    mode: "random",
    length: DEFAULT_PASSWORD_LENGTH.random,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeSimilar: false,
    excludeAmbiguous: false,
    separator: "hyphen",
    capitalize: false,
    includeNumber: false,
    attack: DEFAULT_ATTACK_MODEL,
};
