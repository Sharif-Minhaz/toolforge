/**
 * A pseudo-random source that answers the same way twice.
 *
 * The brief asked for deterministic execution while listing `Random`, `UUID`
 * and `Random Name` as nodes; those two cannot both hold. What is achievable —
 * and what is actually worth having — is **reproducibility**: a request may
 * carry a seed, and the same graph over the same request with the same seed
 * produces byte-identical output. That is what makes a mock usable as a test
 * fixture rather than only as a demo.
 *
 * `sfc32` (Small Fast Counter, 32-bit) rather than an LCG or `Math.random`:
 * it is fifteen lines, passes PractRand, and has a full 128-bit state that a
 * string seed can be expanded into. `Math.random` is explicitly unseedable in
 * every JavaScript engine, which is the whole reason this file exists.
 *
 * **Not for anything that has to be unguessable.** Workspace secrets and
 * recovery keys are drawn from `crypto.getRandomValues` in `credentials.ts`;
 * this generates fake customer names.
 */

export type SeededRandom = () => number;

/**
 * `xmur3` — expands a string into four well-mixed 32-bit words.
 *
 * Seeding `sfc32` directly from a string's characters gives neighbouring seeds
 * neighbouring output, so `seed=1` and `seed=2` would produce visibly similar
 * first draws. Running the string through an avalanche hash first is what makes
 * one character's difference change everything.
 */
function expandSeed(seed: string): [number, number, number, number] {
    let h = 1_779_033_703 ^ seed.length;

    for (let index = 0; index < seed.length; index += 1) {
        h = Math.imul(h ^ seed.charCodeAt(index), 3_432_918_353);
        h = (h << 13) | (h >>> 19);
    }

    const next = (): number => {
        h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
        h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
        h ^= h >>> 16;

        return h >>> 0;
    };

    return [next(), next(), next(), next()];
}

/** A generator in `[0, 1)`, exactly like `Math.random` but repeatable. */
export function createSeededRandom(seed: string): SeededRandom {
    let [a, b, c, d] = expandSeed(seed);

    return () => {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;

        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;

        return (t >>> 0) / 4_294_967_296;
    };
}

/** An integer in `[min, max]`, both ends included. */
export function randomInt(random: SeededRandom, min: number, max: number): number {
    if (max <= min) {
        return min;
    }

    return min + Math.floor(random() * (max - min + 1));
}

export function randomPick<T>(random: SeededRandom, items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[randomInt(random, 0, items.length - 1)];
}

const HEX = "0123456789abcdef";

/**
 * A version 4 UUID from the seeded source.
 *
 * `crypto.randomUUID` would be better randomness and worse behaviour: it cannot
 * be seeded, so an endpoint returning an id would break the reproducibility
 * invariant for every caller who relied on it. The version and variant nibbles
 * are set exactly as RFC 9562 requires, so what comes out is a real v4 that any
 * parser accepts — it is simply drawn from a source that repeats on demand.
 */
export function seededUuid(random: SeededRandom): string {
    let out = "";

    for (let index = 0; index < 36; index += 1) {
        if (index === 8 || index === 13 || index === 18 || index === 23) {
            out += "-";
            continue;
        }

        if (index === 14) {
            out += "4";
            continue;
        }

        const nibble = Math.floor(random() * 16);

        // The variant nibble is 8, 9, a or b — the top two bits fixed to `10`.
        out += index === 19 ? HEX[(nibble & 0x3) | 0x8] : HEX[nibble];
    }

    return out;
}

/**
 * The seed a request runs under.
 *
 * Explicit when the caller asked for one, so a test can pin a fixture; derived
 * from the endpoint and the path otherwise, so two different routes do not
 * return the same "random" name while a single route stays stable enough to be
 * recognisable between calls.
 */
export function resolveSeed(
    explicit: string | undefined,
    endpointId: string,
    path: string,
): string {
    const trimmed = explicit?.trim();

    return trimmed !== undefined && trimmed !== "" ? trimmed : `${endpointId}:${path}`;
}
