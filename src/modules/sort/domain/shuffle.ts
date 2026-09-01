import type { RandomBytes } from "@/modules/tools/types";

/**
 * A shuffle that survives hydration.
 *
 * Randomness and a server-rendered result do not mix: drawing the order during
 * render gives the server one arrangement and the browser another, and the
 * first paint is then thrown away. So the *seed* is drawn once — on the server
 * for the first paint, in a click handler for every reshuffle after it — and
 * passed through as an ordinary value, while the arrangement itself is derived
 * from it by a generator that is pure, deterministic and identical in every
 * runtime.
 *
 * `mulberry32` is that generator. Thirty-two bits of state, spec-exact
 * arithmetic through `Math.imul`, and no dependence on anything the host
 * provides. It is not a cryptographic source and does not need to be: shuffling
 * a shopping list is not a secret. Where randomness has to be unguessable this
 * codebase uses `tools/domain/random.ts` instead, which never leaves Web Crypto.
 */
function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

/** Fisher–Yates, driven by the seed rather than by the clock. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
    const out = [...items];
    const random = createSeededRandom(seed);

    for (let index = out.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [out[index], out[swap]] = [out[swap], out[index]];
    }

    return out;
}

/**
 * One seed, from wherever the caller's randomness comes from. Called on the
 * server for the first paint and in the reshuffle handler afterwards — never
 * during render, and never in a `useState` initialiser.
 */
export function drawShuffleSeed(randomBytes: RandomBytes): number {
    const bytes = randomBytes(4);

    return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}
